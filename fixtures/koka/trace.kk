// refused: trace
// trace prints under a total row.
module printing-fixture
pub fun quiet(n: int): int
  trace("n is " ++ n.show)
  n
