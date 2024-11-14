import tensorflow as tf
import numpy as np
import io
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi import FastAPI, File, UploadFile, HTTPException
from PIL import Image

app = FastAPI(title="Monet Style GAN")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Generator:
    def __init__(self):
        self.model = tf.saved_model.load("monet_generator/saved_model")
        self.serve_fn = self.model.signatures["serving_default"]

    def __call__(self, inputs, training=None):
        # Get the input tensor name from the signature
        input_name = list(self.serve_fn.structured_input_signature[1].keys())[0]
        inputs = tf.cast(inputs, tf.float32)
        result = self.serve_fn(**{input_name: inputs})
        # Get the output tensor name from the signature
        output_name = list(result.keys())[0]
        return result[output_name]


try:
    generator = Generator()
    # Print the input and output tensor names for debugging
    print(
        "Input tensor names:",
        list(generator.serve_fn.structured_input_signature[1].keys()),
    )
    print("Output tensor names:", list(generator.serve_fn.structured_outputs.keys()))
except Exception as e:
    raise Exception(f"Error loading model: {str(e)}")


def process_image(image: Image.Image, target_size=(256, 256)) -> tf.Tensor:
    """Process image for model input"""
    image = image.resize(target_size)
    img_array = tf.keras.preprocessing.image.img_to_array(image)
    img_array = (img_array / 127.5) - 1
    return tf.expand_dims(img_array, 0)


def postprocess_image(generated_img: tf.Tensor) -> bytes:
    """Convert model output to bytes"""
    img_array = ((generated_img[0] + 1) * 127.5).numpy().astype(np.uint8)
    img = Image.fromarray(img_array)
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format="JPEG")
    return img_byte_arr.getvalue()


@app.post("/transform/")
async def transform_image(file: UploadFile = File(...)) -> Response:
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File provided is not an image")

    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        processed_img = process_image(img)
        print("Processed image shape:", processed_img.shape)  # Debug print
        generated_img = generator(processed_img)
        print("Generated image shape:", generated_img.shape)  # Debug print
        img_bytes = postprocess_image(generated_img)
        return Response(content=img_bytes, media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(500, f"Error processing image: {str(e)}")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "Service is up and running"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
