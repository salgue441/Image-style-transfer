import tensorflow as tf
from .blocks import DownsampleBlock, UpsampleBlock

class Generator(tf.keras.Model):
    def __init__(self, config, name="generator", **kwargs):
        super().__init__(name=name, **kwargs)
        self.config = config

        self.downsample_stack = [
            DownsampleBlock(64, 4, apply_norm=False),
            DownsampleBlock(128, 4),
            DownsampleBlock(256, 4),
            DownsampleBlock(512, 4),
            DownsampleBlock(512, 4),
            DownsampleBlock(512, 4),
            DownsampleBlock(512, 4),
            DownsampleBlock(512, 4),
        ]

        self.upsample_stack = [
            UpsampleBlock(512, 4, apply_dropout=True),
            UpsampleBlock(512, 4, apply_dropout=True),
            UpsampleBlock(512, 4, apply_dropout=True),
            UpsampleBlock(512, 4),
            UpsampleBlock(256, 4),
            UpsampleBlock(128, 4),
            UpsampleBlock(64, 4),
        ]

        self.final_conv = tf.keras.layers.Conv2DTranspose(
            filters=config.channels,
            kernel_size=4,
            strides=2,
            padding="same",
            kernel_initializer=tf.keras.initializers.RandomNormal(0.0, 0.02),
            activation="tanh",
        )

    def call(self, x, training=False):
        skips = []
        for down in self.downsample_stack:
            x = down(x, training=training)
            skips.append(x)

        skips = reversed(skips[:-1])

        for up, skip in zip(self.upsample_stack, skips):
            x = up(x, training=training)
            x = tf.keras.layers.Concatenate()([x, skip])

        return self.final_conv(x)