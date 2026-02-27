import { expect } from 'vitest';

/**
 * Install MemberJunction-specific custom matchers for Vitest.
 * Call this once in your setup file or at the top of your test.
 */
export function installCustomMatchers(): void {
  expect.extend({
    /**
     * Asserts that a value looks like a valid MJ entity (has a non-empty ID)
     */
    toBeValidEntity(received: unknown) {
      const entity = received as Record<string, unknown> | null;
      const pass = entity != null &&
        typeof entity === 'object' &&
        'ID' in entity &&
        typeof entity.ID === 'string' &&
        entity.ID.length > 0;

      return {
        pass,
        message: () => pass
          ? `expected value not to be a valid entity, but it has ID="${(entity as Record<string, unknown>).ID}"`
          : `expected value to be a valid entity with a non-empty string ID, got ${JSON.stringify(received)}`,
      };
    },

    /**
     * Asserts that a RunView result has Success: true
     */
    toHaveSucceeded(received: unknown) {
      const result = received as { Success?: boolean; ErrorMessage?: string } | null;
      const pass = result != null && result.Success === true;

      return {
        pass,
        message: () => pass
          ? `expected result not to have succeeded`
          : `expected result to have succeeded but got: ${result?.ErrorMessage ?? 'Success was not true'}`,
      };
    },

    /**
     * Asserts that an entity-like object has a specific field
     */
    toHaveEntityField(received: unknown, fieldName: string) {
      const entity = received as Record<string, unknown> | null;
      const pass = entity != null && typeof entity === 'object' && fieldName in entity;

      return {
        pass,
        message: () => pass
          ? `expected entity not to have field "${fieldName}"`
          : `expected entity to have field "${fieldName}", got keys: ${entity ? Object.keys(entity).join(', ') : 'null'}`,
      };
    },
  });
}
