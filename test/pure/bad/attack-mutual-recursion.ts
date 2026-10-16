// expect: Not in L: recursion (ping → pong → ping)
const ping = (n: number): number => pong(n);
const pong = (n: number): number => ping(n);
export const start = ping;
