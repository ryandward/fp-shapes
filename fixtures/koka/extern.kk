// refused: extern
// Foreign code is the shell's; a core performs an operation and the shell answers it.
module extern-fixture
extern js-anything(x: int): total int
  js inline "(#1)"
