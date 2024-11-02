import { NextResponse } from "next/server"
import * as tf from "@tensorflow/tfjs"
import { join } from "path"
import { writeFile } from "fs/promises"
import crypto from "crypto"
import { processImage } from "@/lib/process-image"

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

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image is too large" }, { status: 400 })
    }

    const fileName = `${crypto.randomUUID()}-${file.name}`
    const uploadPath = join(process.cwd(), "public/uploads", fileName)

    const arrayBuffer = await file.arrayBuffer()
    await writeFile(uploadPath, Buffer.from(arrayBuffer))

    const stylizedImage = await processImage(uploadPath)
    return NextResponse.json({ stylizedImageUrl: `/uploads/${stylizedImage}` })
  } catch (error) {
    console.error("Error processing image", error)

    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    )
  }
}
