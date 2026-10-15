// refused: pretend-decreasing
module decreasing-fixture
pub fun forever(n: int): int
  pretend-decreasing(forever(n))
