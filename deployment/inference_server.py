import tensorflow as tf
import numpy as np
import io
import gc
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

# Memory optimization
tf.config.set_soft_device_placement(True)
tf.config.threading.set_intra_op_parallelism_threads(1)
tf.config.threading.set_inter_op_parallelism_threads(1)


class Generator:
    def __init__(self):
        try:
            tf.config.experimental.set_memory_growth(
                tf.config.experimental.list_physical_devices("GPU")[0], True
            )

        except:
            pass

        self.model = tf.saved_model.load("monet_generator/saved_model")
        self.serve_fn = self.model.signatures["serving_default"]

    def __call__(self, inputs, training=None):
        input_name = list(self.serve_fn.structured_input_signature[1].keys())[0]
        inputs = tf.cast(inputs, tf.float32)
        result = self.serve_fn(**{input_name: inputs})

        output_name = list(result.keys())[0]
        return result[output_name]


try:
    generator = Generator()

except Exception as e:
    raise Exception(f"Error loading model: {str(e)}")


def process_image(image: Image.Image, target_size=(256, 256)) -> tf.Tensor:
    """
    Processes the image to be compatible with the model

    Args:
        image (PIL.Image.Image): Input image
        target_size (tuple): Target size for the image

    Returns:
        tf.Tensor: Processed image
    """

    try:
        image = image.resize(target_size)
        img_array = tf.keras.preprocessing.image.img_to_array(image)
        img_array = (img_array / 127.5) - 1

        return tf.expand_dims(img_array, 0)

    finally:
        gc.collet()


def postprocess_image(generated_img: tf.Tensor) -> bytes:
    """
    Postprocesses the generated image to be compatible with the API

    Args:
        generated_img (tf.Tensor): Generated image

    Returns:
        bytes: Processed image
    """
    try:
        img_array = ((generated_img[0] + 1) * 127.5).numpy().astype(np.uint8)
        img_byte_arr = io.BytesIO()

        return img_byte_arr.getvalue()
    finally:
        gc.collect()


@app.post("/transform/")
async def transform_image(file: UploadFile = File(...)) -> Response:
    """
    Transforms the input image to a Monet-style image

    Args:
        file (UploadFile, required): Input image

    Returns:
        Response: Transformed image

    Raises:
        HTTPException: If the file provided is not an image
        HTTPException: If there is an error processing the image
    """

    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File provided is not an image")

    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")

        processed_img = process_image(img)
        del img
        gc.collect()

        generated_img = generator(processed_img)
        del processed_img
        gc.collect()

        img_bytes = postprocess_image(generated_img)
        del generated_img
        gc.collect()

        return Response(
            content=img_bytes,
            media_type="image/jpeg",
            headers={"Content-Length": str(len(img_bytes))},
        )
    except Exception as e:
        print(f"Error: {str(e)}")
        raise HTTPException(500, f"Error processing image: {str(e)}")

    finally:
        gc.collect()


@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "Service is up and running"}


if __name__ == "__main__":
    import uvicorn

    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=8000,
        workers=1,
        limit_concurrency=1,
        timeout_keep_alive=60,
        loop="asyncio",
    )

    server = uvicorn.Server(config)
    server.run()
