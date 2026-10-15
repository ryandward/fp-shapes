// refused: @copy
module internal-fixture
pub struct receipt(token: string, bytes: int)
pub fun tweak(r: receipt): receipt
  @copy(r, bytes = 2)
