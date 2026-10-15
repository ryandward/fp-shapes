// accepted
// The gate reads tokens, not text: a banned word inside a comment or a
// string literal is not a use of it. extern unsafe-total var handler
module words-fixture
pub fun label(): string
  "extern, unsafe-total, var and handler are words here"
pub fun quote(): string
  r"a raw string with /* handler */ and 'trace' inside"
pub fun char(): char
  'v'
