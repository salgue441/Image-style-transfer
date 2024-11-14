import { NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import sharp from "sharp"
import dotenv from "dotenv"
import axios from "axios"
import FormData from "form-data"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

dotenv.config()

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
}

async function processImage(buffer: Buffer) {
  const image = sharp(buffer)
  return image.resize(256, 256, { fit: "contain" }).toBuffer()
}

async function uploadToS3(buffer: Buffer, key: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: "image/jpeg",
  })

  await s3Client.send(command)
  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
}

export async function POST(request: Request) {
  try {
    const data = await request.formData()
    const file: File | null = data.get("image") as File

    if (!file) {
      return NextResponse.json({ error: "No image uploaded" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const processedBuffer = await processImage(buffer)
    const formData = new FormData()

    formData.append("file", processedBuffer, {
      filename: file.name,
      contentType: "image/jpeg",
    })

    const EC2_URL = process.env.AWS_EC2_PUBLIC_IP
    if (!EC2_URL) {
      throw new Error("AWS_EC2_PUBLIC_IP environment variable is not set")
    }

    console.log("Sending request to EC2...")
    const url = `http://${EC2_URL}:8000/transform`

    const instance = axios.create({
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    })

    const response = await instance.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      responseType: "arraybuffer",
    })

    console.log("Received response from EC2")

    const timestamp = Date.now()
    const originalKey = `originals/${timestamp}-${file.name}`
    const processedKey = `processed/${timestamp}-${file.name}`

    const [originalUrl, processedUrl] = await Promise.all([
      uploadToS3(buffer, originalKey),
      uploadToS3(Buffer.from(response.data), processedKey),
    ])

    return NextResponse.json({
      success: true,
      originalUrl,
      processedUrl,
    })
  } catch (error) {
    console.error("Error processing image:", error)
    let errorMessage = "Unknown error"
    let statusCode = 500

    if (axios.isAxiosError(error)) {
      console.error("Axios Error:", {
        message: error.message,
        code: error.code,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          timeout: error.config?.timeout,
        },
      })

      if (error.code === "ECONNABORTED") {
        errorMessage =
          "The image processing took too long. Please try again with a smaller image."
        statusCode = 504
      } else if (error.response) {
        try {
          const responseData = error.response.data
          if (Buffer.isBuffer(responseData)) {
            errorMessage = responseData.toString("utf-8")
          } else {
            errorMessage = JSON.stringify(responseData)
          }
          statusCode = error.response.status
        } catch (e) {
          errorMessage = `Server error: ${error.response.status}`
        }
      } else if (error.request) {
        errorMessage = "Could not connect to image processing server"
        statusCode = 503
      }
    }

    return NextResponse.json(
      {
        error: "Failed to process image",
        details: errorMessage,
        requestId: crypto.randomUUID(),
      },
      { status: statusCode }
    )
  }
}
