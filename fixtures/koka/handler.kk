// refused: handler
// A core that answers its own operations is a core without a shell.
module handler-fixture
pub effect ask
  ctl ask(): int
pub fun forged(): int
  handler
    ctl ask() resume(42)
  ask()
