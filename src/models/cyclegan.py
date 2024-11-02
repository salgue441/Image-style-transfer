import tensorflow as tf
from src.config import ModelConfig
from .generator import Generator
from .discriminator import Discriminator

class CycleGAN(tf.keras.Model):
    def __init__(self, config: ModelConfig, **kwargs):
        super().__init__(**kwargs)
        self.config = config

        # Generators
        self.gen_G = Generator(config, name="generator_G")
        self.gen_F = Generator(config, name="generator_F")

        # Discriminators
        self.disc_X = Discriminator(config, name="discriminator_X")
        self.disc_Y = Discriminator(config, name="discriminator_Y")

        # Optimizers with same settings
        optimizer_kwargs = dict(
            learning_rate=config.learning_rate, beta_1=config.beta_1
        )
        self.gen_G_optimizer = tf.keras.optimizers.Adam(**optimizer_kwargs)
        self.gen_F_optimizer = tf.keras.optimizers.Adam(**optimizer_kwargs)
        self.disc_X_optimizer = tf.keras.optimizers.Adam(**optimizer_kwargs)
        self.disc_Y_optimizer = tf.keras.optimizers.Adam(**optimizer_kwargs)

        # Loss trackers
        self.gen_G_loss_tracker = tf.keras.metrics.Mean(name="gen_G_loss")
        self.gen_F_loss_tracker = tf.keras.metrics.Mean(name="gen_F_loss")
        self.disc_X_loss_tracker = tf.keras.metrics.Mean(name="disc_X_loss")
        self.disc_Y_loss_tracker = tf.keras.metrics.Mean(name="disc_Y_loss")
        self.cycle_loss_tracker = tf.keras.metrics.Mean(name="cycle_loss")
        self.identity_loss_tracker = tf.keras.metrics.Mean(name="identity_loss")

    def compile(self, **kwargs):
        super().compile(**kwargs)

    def call(self, inputs, training=False):
        if isinstance(inputs, tuple):
            real_x, real_y = inputs

            if training:
                fake_y = self.gen_G(real_x, training=training)
                fake_x = self.gen_F(real_y, training=training)

                return fake_y, fake_x

            else:
                return self.gen_G(real_x, training=training)

        return self.gen_G(inputs, training=training)

    def _generator_loss(self, disc_generated_output):
        """
        Calculates the generator loss using the discriminator output.

        Args:
            disc_generated_output: Discriminator output.

        Returns:
            The generator loss.
        """

        return tf.reduce_mean(
            tf.keras.losses.binary_crossentropy(
                tf.ones_like(disc_generated_output),
                disc_generated_output,
                from_logits=True,
            )
        )

    def _discriminator_loss(self, real_output, fake_output):
        """
        Calculates the discriminator loss.

        Args:
            real_output: Real output.
            fake_output: Fake output.

        Returns:
            The discriminator loss.
        """

        real_loss = tf.keras.losses.binary_crossentropy(
            tf.ones_like(real_output), real_output, from_logits=True
        )

        fake_loss = tf.keras.losses.binary_crossentropy(
            tf.zeros_like(fake_output), fake_output, from_logits=True
        )

        return tf.reduce_mean(real_loss + fake_loss) * 0.5

    def _cycle_loss(self, real_image, cycled_image):
        """
        Calculates the consistency loss using the L1 norm.

        Args:
            real_image: Real image.
            cycled_image: Cycled image.

        Returns:
            The cycle consistency loss.
        """

        return tf.reduce_mean(tf.abs(real_image - cycled_image))

    def _identity_loss(self, real_image, same_image):
        """
        Calculates the identity loss using the L1 norm.

        Args:
            real_image: Real image.
            same_image: Image after identity mapping.

        Returns:
            The identity loss.
        """
        return tf.reduce_mean(tf.abs(real_image - same_image))

    def train_step(self, batch_data):
        if isinstance(batch_data, tuple):
            real_x = batch_data[0]
            real_y = batch_data[1]

        else:
            raise ValueError(
                "Expected tuple of two tensors, got: {}".format(batch_data)
            )

        if real_x.shape != real_y.shape:
            raise ValueError(f"Shape mismatch: {real_x.shape} vs {real_y.shape}")

        with tf.GradientTape(persistent=True) as tape:
            # Generator outputs
            fake_y = self.gen_G(real_x, training=True)
            fake_x = self.gen_F(real_y, training=True)

            # Cycle consistency
            cycled_x = self.gen_F(fake_y, training=True)
            cycled_y = self.gen_G(fake_x, training=True)

            # Identity mapping
            same_x = self.gen_F(real_x, training=True)
            same_y = self.gen_G(real_y, training=True)

            # Discriminator outputs
            disc_real_x = self.disc_X(real_x, training=True)
            disc_fake_x = self.disc_X(fake_x, training=True)
            disc_real_y = self.disc_Y(real_y, training=True)
            disc_fake_y = self.disc_Y(fake_y, training=True)

            # Generator losses
            gen_G_loss = self._generator_loss(disc_fake_y)
            gen_F_loss = self._generator_loss(disc_fake_x)

            # Cycle consistency loss
            cycle_loss = (
                self._cycle_loss(real_x, cycled_x) + self._cycle_loss(real_y, cycled_y)
            ) * self.config.lambda_cycle

            # Identity loss
            identity_loss = (
                self._identity_loss(real_x, same_x)
                + self._identity_loss(real_y, same_y)
            ) * self.config.lambda_identity

            # Total generator losses
            total_gen_G_loss = gen_G_loss + cycle_loss + identity_loss
            total_gen_F_loss = gen_F_loss + cycle_loss + identity_loss

            # Discriminator losses
            disc_X_loss = self._discriminator_loss(disc_real_x, disc_fake_x)
            disc_Y_loss = self._discriminator_loss(disc_real_y, disc_fake_y)

        # Calculate and apply gradients
        gen_G_gradients = tape.gradient(
            total_gen_G_loss, self.gen_G.trainable_variables
        )
        gen_F_gradients = tape.gradient(
            total_gen_F_loss, self.gen_F.trainable_variables
        )
        disc_X_gradients = tape.gradient(disc_X_loss, self.disc_X.trainable_variables)
        disc_Y_gradients = tape.gradient(disc_Y_loss, self.disc_Y.trainable_variables)

        # Apply gradients
        self.gen_G_optimizer.apply_gradients(
            zip(gen_G_gradients, self.gen_G.trainable_variables)
        )
        self.gen_F_optimizer.apply_gradients(
            zip(gen_F_gradients, self.gen_F.trainable_variables)
        )
        self.disc_X_optimizer.apply_gradients(
            zip(disc_X_gradients, self.disc_X.trainable_variables)
        )
        self.disc_Y_optimizer.apply_gradients(
            zip(disc_Y_gradients, self.disc_Y.trainable_variables)
        )

        # Update metrics
        self.gen_G_loss_tracker.update_state(total_gen_G_loss)
        self.gen_F_loss_tracker.update_state(total_gen_F_loss)
        self.disc_X_loss_tracker.update_state(disc_X_loss)
        self.disc_Y_loss_tracker.update_state(disc_Y_loss)
        self.cycle_loss_tracker.update_state(cycle_loss)
        self.identity_loss_tracker.update_state(identity_loss)

        return {
            "gen_G_loss": self.gen_G_loss_tracker.result(),
            "gen_F_loss": self.gen_F_loss_tracker.result(),
            "disc_X_loss": self.disc_X_loss_tracker.result(),
            "disc_Y_loss": self.disc_Y_loss_tracker.result(),
            "cycle_loss": self.cycle_loss_tracker.result(),
            "identity_loss": self.identity_loss_tracker.result(),
        }

    @property
    def metrics(self) -> list:
        """
        Returns the model's metrics.

        Returns:
            A list of metrics.
        """

        return [
            self.gen_G_loss_tracker,
            self.gen_F_loss_tracker,
            self.disc_X_loss_tracker,
            self.disc_Y_loss_tracker,
            self.cycle_loss_tracker,
            self.identity_loss_tracker,
        ]