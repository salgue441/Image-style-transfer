import tensorflow as tf
from models.blocks import DownsampleBlock


class Discriminator(tf.keras.Model):
    def __init__(self, config, name="discriminator", **kwargs):
        super().__init__(name=name, **kwargs)
        self.config = config

        self.down_stack = [
            DownsampleBlock(config.base_filters, apply_norm=False),
            DownsampleBlock(config.base_filters * 2),
            DownsampleBlock(config.base_filters * 4),
        ]

        self.zero_pad1 = tf.keras.layers.ZeroPadding2D()
        self.conv = tf.keras.layers.Conv2D(
            config.base_filters * 8,
            4,
            strides=1,
            kernel_initializer=tf.keras.initializers.RandomNormal(0.0, 0.02),
            use_bias=False,
        )

        self.batch_norm = tf.keras.layers.BatchNormalization(
            gamma_initializer=tf.keras.initializers.RandomNormal(0.0, 0.02)
        )

        self.leaky_relu = tf.keras.layers.LeakyReLU(0.2)
        self.zero_pad2 = tf.keras.layers.ZeroPadding2D()
        self.final_conv = tf.keras.layers.Conv2D(
            1,
            4,
            strides=1,
            kernel_initializer=tf.keras.initializers.RandomNormal(0.0, 0.02),
        )

    def call(self, x, training=False):
        for down in self.down_stack:
            x = down(x, training=training)

        x = self.zero_pad1(x)
        x = self.conv(x)
        x = self.batch_norm(x, training=training)
        x = self.leaky_relu(x)
        x = self.zero_pad2(x)

        return self.final_conv(x)
