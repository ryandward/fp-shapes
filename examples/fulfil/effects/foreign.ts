// The surfaces of the systems the attempt depends on, as they are: a stock
// system that reserves and releases, a payment gateway that charges or
// declines, a carrier that ships. Their failures arrive as thrown errors and
// their refusals as plain results; adapt.ts turns each into a case once.

export type Reservation = {
  readonly holdId: string;
  readonly allocations: ReadonlyArray<{ readonly sku: string; readonly qty: number; readonly warehouse: string | null; readonly vendor: string | null }>;
  readonly missing: ReadonlyArray<{ readonly sku: string; readonly qty: number }>;
};

export type Charge = { readonly ok: true; readonly amount: number } | { readonly ok: false; readonly reason: string };

export type Foreign = {
  readonly reserve: (orderId: string, lines: ReadonlyArray<{ readonly sku: string; readonly qty: number }>) => Promise<Reservation>;
  readonly release: (holdId: string) => Promise<void>;
  readonly charge: (orderId: string, amount: number) => Promise<Charge>;
  readonly ship: (holdId: string, to: { readonly name: string; readonly lines: ReadonlyArray<string>; readonly country: string }) => Promise<string>;
  readonly log: (line: string) => void;
};
