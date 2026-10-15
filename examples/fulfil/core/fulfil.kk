// One attempt at fulfilling one order. A second core, unrelated to ingest,
// written to find out what the FFI generator does not carry: an order is a
// struct holding a vector of structs and a nested struct with a vector of
// strings; a reservation answers with a receipt and a vector of allocations,
// each a struct holding a struct and a sum; the status carries vectors out.
module fulfil

import evidence

pub struct line(sku: string, qty: int)

pub type source
  Warehouse(code: string)
  Dropship(vendor: string)

pub struct allocation(line: line, from: source)

pub struct address(name: string, lines: vector<string>, country: string)

pub struct order(id: string, lines: vector<line>, total: int, to: address)

pub type reserve-outcome
  Reserved(hold: hold-receipt, allocations: vector<allocation>)
  Short(missing: vector<line>)
  ReserveDied(diagnostic: string)

pub type charge-outcome
  Charged(amount: int)
  Declined(reason: string)
  ChargeDied(diagnostic: string)

pub type ship-outcome
  Shipped(tracking: string)
  ShipDied(diagnostic: string)

pub type release-outcome
  Released
  ReleaseDied(diagnostic: string)

pub type order-status
  Fulfilled(tracking: string, allocations: vector<allocation>)
  Backordered(missing: vector<line>)
  PaymentDeclined(reason: string)
  WorkerDied(diagnostic: string)

// The command algebra of this plane. The hold is spent by ship or by release,
// never both, never neither.
pub effect fulfilment
  ctl reserve(id: string, lines: vector<line>): reserve-outcome
  ctl charge(id: string, amount: int): charge-outcome
  ctl ship(hold: hold-receipt, to: address): ship-outcome
  ctl release(hold: hold-receipt): release-outcome

fun let-go(hold: hold-receipt, after: order-status): fulfilment order-status
  match release(hold)
    Released -> after
    ReleaseDied(d) -> WorkerDied(d)

fun dispatch(hold: hold-receipt, to: address, allocations: vector<allocation>): fulfilment order-status
  match ship(hold, to)
    Shipped(tracking) -> Fulfilled(tracking, allocations)
    ShipDied(d) -> WorkerDied(d)

fun settle-up(o: order, hold: hold-receipt, allocations: vector<allocation>): fulfilment order-status
  match charge(o.id, o.total)
    Charged(_) -> dispatch(hold, o.to, allocations)
    Declined(reason) -> let-go(hold, PaymentDeclined(reason))
    ChargeDied(d) -> let-go(hold, WorkerDied(d))

pub fun fulfil(o: order): fulfilment order-status
  match reserve(o.id, o.lines)
    Reserved(hold, allocations) -> settle-up(o, hold, allocations)
    Short(missing) -> Backordered(missing)
    ReserveDied(d) -> WorkerDied(d)
