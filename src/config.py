from dataclasses import dataclass

@dataclass
class ModelConfig:
  height: int = 256
  width: int = 256
  channels: int = 3
  base_filters: int = 64
  lambda_cycle: float = 10.0
  lambda_identity: float = 0.5
  learning_rate: float = 2e-4
  beta_1: float = 0.5