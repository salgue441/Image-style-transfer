import tensorflow as tf
from pathlib import Path
from datetime import datetime
from train import setup_training
from models.cyclegan import CycleGAN


def main():
    gpu_devices = tf.config.experimental.list_physical_devices("GPU")

    if gpu_devices:
        for device in gpu_devices:
            tf.config.experimental.set_memory_growth(device, True)

        strategy = tf.distribute.MirroredStrategy()
        print(f"Number of devices: {strategy.num_replicas_in_sync}")

    else:
        strategy = tf.distribute.get_strategy()
        print("No GPU devices found. Using default strategy.")

    config, train_ds, test_ds, steps_per_epoch = setup_training(
        base_dir="../", batch_size=4
    )

    Path("logs/cyclegan").mkdir(parents=True, exist_ok=True)
    Path("checkpoints/cyclegan").mkdir(parents=True, exist_ok=True)

    with strategy.scope():
        model = CycleGAN(config)
        model.compile()

    callbacks = [
        tf.keras.callbacks.TensorBoard(
            log_dir=f"logs/cyclegan/{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        ),
        tf.keras.callbacks.ModelCheckpoint(
            filepath="checkpoints/cyclegan/model.{epoch:03d}.weights.h5",
            save_freq="epoch",
            save_weights_only=True,
            monitor="gen_G_loss",
            mode="min",
            save_best_only=True,
        ),
    ]

    model.fit(
        train_ds,
        epochs=100,
        steps_per_epoch=steps_per_epoch,
        callbacks=callbacks,
    )

    model.save("cyclegan_model.keras")


if __name__ == "__main__":
    main()
