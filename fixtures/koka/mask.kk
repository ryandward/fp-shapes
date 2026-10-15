// refused: mask
module mask-fixture
pub fun hidden(): int
  mask<exn> { 1 }
