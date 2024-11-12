import * as tf from "@tensorflow/tfjs-node"
import { join } from "path"
import sharp from "sharp"
import crypto from "crypto"
import { promises as fs } from "fs"

let model: tf.GraphModel | null = null

async function loadModel() {
  if (!model) {
    try {
      // Load the model
      const modelPath = `file://${join(
        process.cwd(),
        "public",
        "models",
        "model.json"
      )}`
      console.log("Loading model from:", modelPath)

      // First, read the model.json to check the structure
      const modelJSON = await fs.readFile(
        join(process.cwd(), "public", "models", "model.json"),
        "utf8"
      )
      console.log(
        "Model structure:",
        JSON.stringify(JSON.parse(modelJSON), null, 2)
      )

      model = await tf.loadGraphModel(modelPath)

      // Print input and output node names
      const inputs = model.inputs.map(
        (input) => `Input: ${input.name} Shape: ${input.shape}`
      )
      const outputs = model.outputs.map(
        (output) => `Output: ${output.name} Shape: ${output.shape}`
      )
      console.log("Model inputs:", inputs)
      console.log("Model outputs:", outputs)

      console.log("Model loaded successfully")
    } catch (err) {
      console.error("Detailed error while loading model:", err)
      throw err
    }
  }
  return model
}

export async function processImage(imagePath: string): Promise<string> {
  try {
    // Load and preprocess image
    console.log("Loading image:", imagePath)
    const image = await sharp(imagePath)
      .resize(256, 256, { fit: "cover" })
      .raw()
      .toBuffer()

    // Convert to tensor and normalize to [-1, 1] range
    const tensor = tf
      .tensor3d(new Uint8Array(image), [256, 256, 3])
      .div(127.5)
      .sub(1)
      .expandDims(0)

    console.log("Input tensor shape:", tensor.shape)

    // Load model and run inference
    const loadedModel = await loadModel()

    // Get input tensor name from model
    const inputTensor = loadedModel.inputs[0]
    console.log("Using input tensor:", inputTensor.name)

    // Create prediction input object
    const feeds: { [key: string]: tf.Tensor } = {}
    feeds[inputTensor.name] = tensor

    // Run prediction
    console.log("Running prediction...")
    const prediction = (await loadedModel.predict(feeds)) as tf.Tensor
    console.log("Prediction shape:", prediction.shape)

    // Post-process
    const processed = prediction
      .squeeze()
      .mul(127.5)
      .add(127.5)
      .clipByValue(0, 255)

    // Save output image
    const outputFileName = `stylized-${crypto.randomUUID()}.jpg`
    const outputPath = join(process.cwd(), "public", "uploads", outputFileName)

    // Ensure uploads directory exists
    await fs.mkdir(join(process.cwd(), "public", "uploads"), {
      recursive: true,
    })

    // Save image
    const imageData = await tf.node.encodePng(processed as tf.Tensor3D)
    await fs.writeFile(outputPath, imageData)

    // Cleanup
    tf.dispose([tensor, prediction, processed])

    console.log("Successfully processed image:", outputPath)
    return outputFileName
  } catch (error) {
    console.error("Detailed error in processImage:", error)
    throw error
  }
}
