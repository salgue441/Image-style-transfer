import { NextResponse } from "next/server"
import * as tf from "@tensorflow/tfjs-node" // Changed to tfjs-node
import sharp from "sharp"
import { writeFile } from "fs/promises"
import { join } from "path"
import { mkdir } from "fs/promises"

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
}

async function loadAndPreprocessImage(buffer: Buffer) {
  const image = sharp(buffer)
  const resized = await image
    .resize(256, 256, { fit: "contain" })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const tensor = tf
    .tensor3d(new Float32Array(resized.data), [256, 256, 3])
    .div(255.0)

  return tensor
}

async function postprocessImage(tensor: tf.Tensor3D) {
  const denormalized = tensor.mul(255).clipByValue(0, 255)
  const arrayData = await denormalized.array()
  const uint8Data = new Uint8Array(
    arrayData.flat(2).map((val) => Math.round(val))
  )

  return sharp(uint8Data, {
    raw: {
      width: 256,
      height: 256,
      channels: 3,
    },
  })
    .png()
    .toBuffer()
}

export async function POST(request: Request) {
  try {
    const uploadsDir = join(process.cwd(), "public", "uploads")
    await mkdir(uploadsDir, { recursive: true }).catch(() => {})

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

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const inputTensor = await loadAndPreprocessImage(buffer)
    const modelPath = `file://${join(
      process.cwd(),
      "public",
      "models",
      "model.json"
    )}`
    console.log("Loading model from:", modelPath)
    const model = await tf.loadGraphModel(modelPath)

    const outputTensor = await model.predict(inputTensor.expandDims(0))
    const processedImageBuffer = await postprocessImage(outputTensor.squeeze())
    const fileName = `stylized-${crypto.randomUUID()}.png`
    const filePath = join(uploadsDir, fileName)
    await writeFile(filePath, processedImageBuffer)

    inputTensor.dispose()
    outputTensor.dispose()

    return NextResponse.json({
      success: true,
      stylizedImageUrl: `/uploads/${fileName}`,
    })
  } catch (error) {
    console.error("Error processing image:", error)
    console.error("Stack trace:", error.stack)
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    )
  }
}
