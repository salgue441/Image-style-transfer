import tensorflow as tf
from src.config import ModelConfig

class ImageProcessor:
  def __init__(self, config: ModelConfig):
    self.config = config

  def decode_image(self, image: tf.Tensor) -> tf.Tensor:
    """
    Decodes the image tensor to a float32 tensor.

    Args:
      image: tf.Tensor - The image tensor to decode.

    Returns:
      tf.Tensor - The decoded image tensor.
    """

    image = tf.image.decode_image(image, channels=self.config.channels)
    image = tf.cast(image, tf.float32)
    image = (image / 127.5) - 1

    return image
  
  @tf.function
  def parse_tfrecord(self, example_photo: tf.Tensor) -> tf.Tensor:
    """
    Parses the TFRecord file and returns the image tensor.

    Args:
      example_photo: tf.Tensor - The image tensor to parse.

    Returns:
      tf.Tensor - The parsed image tensor.
    """

    feature_description = {
        "image_name": tf.io.FixedLenFeature([], tf.string),
        "image": tf.io.FixedLenFeature([], tf.string),
        "target": tf.io.FixedLenFeature([], tf.string),
    }

    example = tf.io.parse_single_example(example_photo, feature_description)
    return self.decode_image(example["image"])
  
  def create_dataset(
    self,
    filenames: list,
    batch_size: int = 1,
    shuffle: bool = True,
    cache: bool = True
  ) -> tf.data.Dataset:
    """
    Creates a dataset from the given filenames.

    Args:
      filenames: list - The list of filenames to create the dataset from.
      batch_size: int - The batch size for the dataset.
      shuffle: bool - Whether to shuffle the dataset.
      cache: bool - Whether to cache the dataset.

    Returns:
      tf.data.Dataset - The created dataset.
    """

    dataset = tf.data.TFRecordDataset(
      filenames,
      num_parallel_reads=tf.data.experimental.AUTOTUNE
    )

    dataset = dataset.map(
      self.parse_tfrecord, num_parallel_calls=tf.data.experimental.AUTOTUNE
    )

    if shuffle:
       dataset = dataset.shuffle(buffer_size=2048, reshuffle_each_iteration=True)

    dataset = dataset.batch(batch_size, drop_remainder=True)
    if cache:
      dataset = dataset.cache()

    return dataset.prefetch(tf.data.experimental.AUTOTUNE)