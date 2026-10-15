// expect: grammar: AwaitExpression is not a form of the domain
export const later = async (p: Promise<number>): Promise<number> => await p;
