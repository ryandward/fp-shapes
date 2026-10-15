// expect: termination: ping → pong → ping is a cycle
const ping = (n: number): number => pong(n);
const pong = (n: number): number => ping(n);
export const start = ping;
