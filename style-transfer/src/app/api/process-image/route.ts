import { NextResponse } from "next/server"
import { processImage } from "@/lib/process-image"
import { writeFile } from "fs/promises"
import { join } from "path"
import * as tf from "@tensorflow/tfjs-node"
import fs from "fs/promises"

// Initialize TensorFlow
await tf.ready()

export async function POST(request: Request) {
  try {
    const data = await request.formData()
    const file: File | null = data.get("image") as unknown as File

    if (!file) {
      return NextResponse.json(
        { error: "No image found in request" },
        { status: 400 }
      )
    }

    // Validate file size (e.g., 10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image is too large" }, { status: 400 })
    }

    // Save uploaded file temporarily
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const tempFileName = `upload-${crypto.randomUUID()}-${file.name}`
    const tempPath = join(process.cwd(), "public", "uploads", tempFileName)

    await writeFile(tempPath, buffer)

    // Process the image
    const stylizedImage = await processImage(tempPath)

    // Clean up temp file
    await fs.unlink(tempPath).catch(console.error)

    return NextResponse.json({
      success: true,
      stylizedImageUrl: `/uploads/${stylizedImage}`,
    })
  } catch (error) {
    console.error("Error processing image:", error)
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    )
  }
}
