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

  const url = `http://${env.AWS_EC2_PUBLIC_IP}:8000/transform`
  const response = await apiClient.post(url, formData, {
    headers: { ...formData.getHeaders() },
    responseType: "arraybuffer",
  })

  return Buffer.from(response.data)
}

export async function POST(request: Request) {
  try {
    const data = await request.formData()
    const file = data.get("image") as File

    if (!file) {
      return NextResponse.json({ error: "No image uploaded" }, { status: 400 })
    }

    const originalBuffer = Buffer.from(await file.arrayBuffer())
    const processedBuffer = await processImage(originalBuffer)

    const transformedBuffer = await sendToEC2(processedBuffer, file.name)
    const urls = await uploadImages(
      originalBuffer,
      transformedBuffer,
      file.name
    )

    return NextResponse.json({ success: true, ...urls })
  } catch (error) {
    console.error("Error processing image", error)

    if (axios.isAxiosError(error)) {
      const errorDetails = handleAxiosError(error)
      return NextResponse.json(errorDetails.body, {
        status: errorDetails.status,
      })
    }

    return NextResponse.json(
      {
        error: "Failed to process image",
        details: "Unkown error occurred",
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
