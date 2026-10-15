// accepted
// The pure prelude is imported freely; a value's own module too.
module prelude-fixture
import std/core/list
import std/core/vector
pub type outcome
  Found(items: vector<string>)
  Nothing
pub fun items(o: outcome): int
  match o
    Found(xs) -> xs.length
    Nothing -> 0
