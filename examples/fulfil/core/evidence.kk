// The hold a reservation places on stock: issued by the shell when it
// answers `reserve`, carried by the core, and spent by exactly one of `ship`
// and `release`. Abstract, so the core can only hand it on.
module evidence

abstract struct hold-receipt(order-id: string, hold-id: string)
