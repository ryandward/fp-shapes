// expect: purity: Math.random is an effect
export const roll = (): number => Math.random();
