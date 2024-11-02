import * as tf from "@tensorflow/tfjs"
import { join } from "path"
import sharp from "sharp"
import crypto from "crypto"

let model: tf.LayersModel | null = null

async function loadModel() {
  if (!model) {
    model = await tf.loadLayersModel(
      join(process.cwd(), "public", "model", "cyclegan_model.keras")
    )
  }

  return model
}

export async function processImage(imagePath: string): Promise<string> {
  const image = await sharp(imagePath)
    .resize(256, 256, { fit: "cover" })
    .raw()
    .toBuffer()

  const tensor = tf
    .tensor3d(new Uint8Array(image), [256, 256, 3])
    .div(255.0)
    .expandDims(0)

  const model = await loadModel()
  const prediction = model.predict(tensor) as tf.Tensor
  const processed = prediction.squeeze().mul(255).clipByValue(0, 255)

  const outputFileName = `stylized-${crypto.randomUUID()}.jpg`
  const outputPath = join(process.cwd(), "public", "uploads", outputFileName)
  const imageData = await tf.browser.toPixels(processed as tf.Tensor3D)

  tf.dispose([tensor, prediction, processed])
  return new Promise((resolve, reject) => {
    sharp(Buffer.from(imageData), {
      raw: { width: 256, height: 256, channels: 3 },
    })
      .toFile(outputPath)
      .then(() => resolve(outputFileName))
      .catch(reject)
  })
}
