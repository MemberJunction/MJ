import 'vitest';

interface MJCustomMatchers<R = unknown> {
  /** Asserts that a value is a valid MJ entity with a non-empty ID */
  toBeValidEntity(): R;
  /** Asserts that a RunView result has Success: true */
  toHaveSucceeded(): R;
  /** Asserts that an entity-like object has a specific field by name */
  toHaveEntityField(fieldName: string): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Assertion<T = unknown> extends MJCustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface AsymmetricMatchersContaining extends MJCustomMatchers {}
}
