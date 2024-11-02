import tensorflow as tf

class DownsampleBlock(tf.keras.layers.Layer):
    def __init__(self, filters, size=4, strides=2, apply_norm=True, **kwargs):
        super().__init__(**kwargs)
        
        self.conv = tf.keras.layers.Conv2D(
            filters=filters,
            kernel_size=size,
            strides=strides,
            padding="same",
            kernel_initializer=tf.keras.initializers.RandomNormal(0.0, 0.02),
            use_bias=not apply_norm,
        )
        
        self.batch_norm = tf.keras.layers.BatchNormalization(
            gamma_initializer=tf.keras.initializers.RandomNormal(0.0, 0.02)
        ) if apply_norm else None
        
        self.activation = tf.keras.layers.LeakyReLU(0.2)

    def call(self, x, training=True):
        x = self.conv(x)

        if self.batch_norm:
            x = self.batch_norm(x, training=training)

        return self.activation(x)
    
class UpsampleBlock(tf.keras.layers.Layer):
    def __init__(self, filters, size=4, strides=2, apply_dropout=False, **kwargs):
        super().__init__(**kwargs)
        
        self.conv_transpose = tf.keras.layers.Conv2DTranspose(
            filters=filters,
            kernel_size=size,
            strides=strides,
            padding="same",
            kernel_initializer=tf.keras.initializers.RandomNormal(0.0, 0.02),
            use_bias=False,
        )
        
        self.batch_norm = tf.keras.layers.BatchNormalization(
            gamma_initializer=tf.keras.initializers.RandomNormal(0.0, 0.02)
        )
        
        self.dropout = tf.keras.layers.Dropout(0.5) if apply_dropout else None
        self.activation = tf.keras.layers.ReLU()

    def call(self, x, training=True):
        x = self.conv_transpose(x)
        x = self.batch_norm(x, training=training)

        if self.dropout:
            x = self.dropout(x, training=training)
            
        return self.activation(x)