// expect: clean
// A record of functions the domain declared, called by name.
const money = { cents: (n: number): number => n * 100, label: (n: number): string => `${n} cents` };
export const price = (n: number): string => money.label(money.cents(n));
