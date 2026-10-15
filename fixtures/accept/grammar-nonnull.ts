// expect: grammar: NonNullExpression is not a form of the domain
export const sure = (s: string | undefined): string => s!;
