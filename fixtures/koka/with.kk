// refused: with
module with-fixture
pub effect ask
  ctl ask(): int
pub fun forged(): int
  with ctl ask() resume(42)
  ask()
