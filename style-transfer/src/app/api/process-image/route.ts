import { NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import sharp from "sharp"
import dotenv from "dotenv"
import axios from "axios"
import FormData from "form-data"

dotenv.config()

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

export async function POST(request: Request) {
  try {
    const uploadsDir = join(process.cwd(), "public", "uploads")
    await mkdir(uploadsDir, { recursive: true }).catch(() => {})

    const data = await request.formData()
    const file: File | null = data.get("image") as File

    if (!file) {
      return NextResponse.json({ error: "No image uploaded" }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image size should be less than 10MB" },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const processedBuffer = await processImage(buffer)

    const formData = new FormData()
    formData.append("file", processedBuffer, {
      filename: file.name,
      contentType: "image/jpeg",
    })

    const url = `http://${process.env.AWS_EC2_PUBLIC_IP}:8000/transform`
    console.log("Sending request to:", url)

    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      responseType: "arraybuffer",
      timeout: 30000,
    })

    const fileName = `stylized-${crypto.randomUUID()}.jpg`
    const filePath = join(uploadsDir, fileName)
    await writeFile(filePath, Buffer.from(response.data))

    return NextResponse.json({
      success: true,
      stylizedImageUrl: `/uploads/${fileName}`,
    })
  } catch (error) {
    console.error("Error processing image:", error)
    let errorMessage = "Unknown error"

    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error("Response data:", error.response.data)
        console.error("Response status:", error.response.status)
        console.error("Response headers:", error.response.headers)

        const responseData = error.response.data
        if (Buffer.isBuffer(responseData)) {
          errorMessage = responseData.toString("utf-8")
        } else {
          errorMessage = JSON.stringify(responseData)
        }
      } else if (error.request) {
        console.error("No response received:", error.request)
        errorMessage = "No response received from server"
      } else {
        console.error("Error setting up request:", error.message)
        errorMessage = error.message
      }
    }

    return NextResponse.json(
      { error: `Failed to process image: ${errorMessage}` },
      { status: 500 }
    )
  }
}
