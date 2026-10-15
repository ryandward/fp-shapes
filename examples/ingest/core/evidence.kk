// Evidence the shell mints when it answers an operation: the claim this
// attempt holds on the row, the receipt for a fenced write, the receipt for a
// finalized file. Each is abstract: the core receives one inside an outcome
// and can only hand it to a later operation. It cannot construct one, match
// on one or read a field, so an operation that takes a receipt can only be
// reached through the operation that issued it; the order of the pipeline is
// in the types, as it is in the TypeScript worker.
//
// What the compiler does not refuse is a copy with a field changed, which
// Koka derives for every constructor, hidden or not. The shell keeps the
// identity of every value it minted and reads a receipt's fields from that
// record, so a copy is a value of unknown provenance there and the attempt
// halts. A receipt type ends in -receipt: an operation that takes one spends
// it, and the shell refuses the same value a second time.
module evidence

abstract struct claim(file-id: string, token: string)
abstract struct fenced-receipt(file-id: string, bytes: int)
abstract struct finalized-receipt(file-id: string, bytes: int)
