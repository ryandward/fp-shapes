// refused: unsafe-total
// A row is inferred, not asserted.
module laundered-fixture
fun loops(n: int): div int
  loops(n + 1)
pub fun laundered(n: int): total int
  unsafe-total { loops(n) }
