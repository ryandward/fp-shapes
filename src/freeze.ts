// Deep freeze: every object and array reachable from the value through any
// own property (string or symbol keyed, enumerable or not) is frozen.
// Accessor properties are not invoked. Objects already deep-frozen are
// remembered and not walked again.

const frozen = new WeakSet<object>();

export const deepFreeze = <T>(value: T): T => {
  const walk = (v: object): void => {
    if (frozen.has(v)) return;
    frozen.add(v);
    Object.freeze(v);
    for (const key of Reflect.ownKeys(v)) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (descriptor !== undefined && 'value' in descriptor && typeof descriptor.value === 'object' && descriptor.value !== null) walk(descriptor.value);
    }
  };
  if (typeof value === 'object' && value !== null) walk(value);
  return value;
};
