import { NextResponse } from "next/server"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import axios, { AxiosInstance } from "axios"
import { z } from "zod"
import sharp from "sharp"
import FormData from "form-data"

const envSchema = z.object({
  AWS_REGION: z.string(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  AWS_S3_BUCKET: z.string(),
  AWS_EC2_PUBLIC_IP: z.string(),
})

const env = envSchema.parse(process.env)
const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
})

const apiClient: AxiosInstance = axios.create({
  timeout: 120000,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
})

const IMAGE_SIZE = 256
const TIMEOUT_ERROR_STR =
  "The image processing took too long. Please try again with a smaller image."

interface ProcessedUrls {
  originalUrl: string
  processedUrl: string
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: false,
  },
}

/**
 * Process the image and return the processed image URL
 *
 * @param buffer: Buffer - The image buffer
 * @returns ProcessedUrls - The original and processed image URLs
 */
async function processImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: "contain" })
    .toBuffer()
}

/**
 * Auxiliary function to upload the images to the S3 bucket and
 * returns the URLs of the images in the bucket
 *
 * @param buffer: Buffer - The image buffer
 * @param key: string - The key to store the image in S3
 * @returns ProcessedUrls - The original and processed image URLs
 */
async function uploadToS3(buffer: Buffer, key: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: "image/jpeg",
  })

  await s3Client.send(command)
  return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`
}

/**
 * Upload images to S3 and return the URLs
 *
 * @param originalBuffer: Buffer - The original image buffer
 * @param processedBuffer: Buffer - The processed image buffer
 * @param filename: string - The filename of the image
 * @returns ProcessedUrls - The original and processed image URLs
 */
async function uploadImages(
  originalBuffer: Buffer,
  processedBuffer: Buffer,
  filename: string
): Promise<ProcessedUrls> {
  const timestamp = Date.now()
  const originalKey = `originals/${timestamp}-${filename}`
  const processedKey = `processed/${timestamp}-${filename}`

  const [originalUrl, processedUrl] = await Promise.all([
    uploadToS3(originalBuffer, originalKey),
    uploadToS3(processedBuffer, processedKey),
  ])

  return { originalUrl, processedUrl }
}

/**
 * Sends the image to the EC2 instance for style transfer.
 *
 * @param buffer: Buffer - The image buffer
 * @param filename: string - The filename of the image
 * @returns Buffer - The processed image buffer
 */
async function sendToEC2(buffer: Buffer, filename: string): Promise<Buffer> {
  const formData = new FormData()
  formData.append("file", buffer, {
    filename,
    contentType: "image/jpeg",
  })

  const url = `http://${env.AWS_EC2_PUBLIC_IP}:8000/transform/`

  console.log("Sending request to EC2:", {
    url,
    bufferSize: buffer.length,
    filename,
    contentType: "image/jpeg",
  })

  try {
    const response = await apiClient.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
        Accept: "image/jpeg",
      },
      responseType: "arraybuffer",
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: (status) => status === 200,
    })

    console.log("EC2 Response received:", {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      dataLength: response.data?.length || 0,
      contentType: response.headers["content-type"],
    })

    if (!response.data || response.data.length === 0) {
      throw new Error("EC2 returned empty response")
    }

    const responseBuffer = Buffer.from(response.data)
    console.log("Response buffer created:", {
      size: responseBuffer.length,
      isBuffer: Buffer.isBuffer(responseBuffer),
    })

    return responseBuffer
  } catch (error: any) {
    console.error("EC2 request failed:", {
      message: error.message,
      code: error.code,
      responseStatus: error.response?.status,
      responseStatusText: error.response?.statusText,
      responseData: error.response?.data,
      responseHeaders: error.response?.headers,
      isAxiosError: axios.isAxiosError(error),
    })
    throw error
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.formData()
    const file = data.get("image") as File

    if (!file) {
      console.log("No file provided in request")
      return NextResponse.json({ error: "No image uploaded" }, { status: 400 })
    }

    console.log("File received:", {
      name: file.name,
      type: file.type,
      size: file.size,
    })

    try {
      const originalBuffer = Buffer.from(await file.arrayBuffer())
      console.log("Original buffer created, size:", originalBuffer.length)

      const processedBuffer = await processImage(originalBuffer)
      console.log("Image processed, size:", processedBuffer.length)

      try {
        const transformedBuffer = await sendToEC2(processedBuffer, file.name)
        console.log(
          "EC2 transformation complete, size:",
          transformedBuffer.length
        )

        const urls = await uploadImages(
          originalBuffer,
          transformedBuffer,
          file.name
        )
        console.log("Images uploaded successfully:", urls)

        return NextResponse.json({ success: true, ...urls })
      } catch (ec2Error: any) {
        console.error("EC2 or Upload error:", {
          message: ec2Error.message,
          code: ec2Error.code,
          response: ec2Error.response?.data,
          status: ec2Error.response?.status,
        })
        throw ec2Error
      }
    } catch (processingError) {
      console.error("Processing error:", processingError)
      throw processingError
    }
  } catch (error: any) {
    console.error("Error processing image", {
      error: error,
      message: error.message,
      code: error.code,
      stack: error.stack,
    })

    if (axios.isAxiosError(error)) {
      const errorDetails = handleAxiosError(error)
      console.log("Axios error details:", errorDetails)
      return NextResponse.json(errorDetails.body, {
        status: errorDetails.status,
      })
    }

    return NextResponse.json(
      {
        error: "Failed to process image",
        details: error.message || "Unknown error occurred",
        requestId: crypto.randomUUID(),
      },
      { status: 500 }
    )
  }
}

/**
 * Auxiliary function to handle axios errors and returns the appropriate
 * responses to common cases.
 *
 * @param error: any - The error object
 * @returns: { status: number, body: { error: string } }
 */
function handleAxiosError(error: any) {
  if (error.code === "ECONNABORTED") {
    return {
      status: 504,
      body: { error: TIMEOUT_ERROR_STR },
    }
  }

  if (error.response) {
    const responseData = Buffer.isBuffer(error.response.data)
      ? error.response.data.toString("utf-8")
      : JSON.stringify(error.response.data)

    return {
      status: error.response.status,
      body: { error: responseData },
    }
  }

  if (error.request) {
    return {
      status: 503,
      body: { error: "Could not connect to image processing server" },
    }
  }

  return {
    status: 500,
    body: { error: "Internal server error" },
  }
}
