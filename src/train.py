import tensorflow as tf
from pathlib import Path
from config import ModelConfig
from data_pipeline.processor import ImageProcessor
from typing import Tuple


def setup_training(
    base_dir=".", batch_size: int = 1
) -> Tuple[ModelConfig, tf.data.Dataset, tf.data.Dataset, int]:
    """
    Sets up the training pipeline for the CycleGAN model.

    Args:
      base_dir (str): The base directory where the data is stored.
      batch_size (int): The batch size to use during training.

    Returns:
      A tuple containing the ModelConfig, training dataset, test dataset, and steps per epoch.
    """

    config = ModelConfig()

    data_dir = Path(base_dir) / "data"
    monet_files = tf.io.gfile.glob(str(data_dir / "monet_tfrec" / "*.tfrec"))
    photo_files = tf.io.gfile.glob(str(data_dir / "photo_tfrec" / "*.tfrec"))

    if not monet_files or photo_files:
        raise ValueError(f"No TFRecord files found in {data_dir}")

    processor = ImageProcessor(config)
    monet_ds = processor.create_dataset(monet_files, batch_size=batch_size)
    photo_ds = processor.create_dataset(photo_files, batch_size=batch_size)
    test_ds = processor.create_dataset(photo_files[:10], batch_size=1, shuffle=False)

    train_ds = tf.data.Dataset.zip((monet_ds, photo_ds))
    steps_per_epoch = (
        min(
            sum(1 for _ in tf.data.TFRecordDataset(monet_files)),
            sum(1 for _ in tf.data.TFRecordDataset(photo_files)),
        )
        // batch_size
    )

    return config, train_ds, test_ds, steps_per_epoch
