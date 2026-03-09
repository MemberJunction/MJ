/**
 * Tests for mergeExtensibilityOptions — the function that concatenates
 * array-valued extensibility options returned by dynamic packages
 * into the server options object.
 *
 * Since mergeExtensibilityOptions is not exported (it's a module-private function),
 * we test the merge behavior via the public createMJServer pathway indirectly,
 * OR we extract and test the logic inline.
 *
 * For now we replicate the logic here since it's a pure function that's easy to test.
 */
import { describe, it, expect } from 'vitest';

// ─── Replicate the merge logic (mirrors ServerBootstrap/src/index.ts) ────────

const MERGEABLE_KEYS = [
  'ExpressMiddlewareBefore',
  'ExpressMiddlewarePostAuth',
  'ExpressMiddlewareAfter',
  'PreRunViewHooks',
  'PostRunViewHooks',
  'PreSaveHooks',
  'ApolloPlugins',
] as const;

function mergeExtensibilityOptions(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const key of MERGEABLE_KEYS) {
    const sourceArray = source[key];
    if (Array.isArray(sourceArray)) {
      const existing = target[key];
      target[key] = [
        ...(Array.isArray(existing) ? existing : []),
        ...sourceArray,
      ];
    }
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('mergeExtensibilityOptions', () => {
  describe('Array concatenation', () => {
    it('should merge ExpressMiddlewarePostAuth arrays', () => {
      const mw1 = () => {};
      const mw2 = () => {};
      const target: Record<string, unknown> = { ExpressMiddlewarePostAuth: [mw1] };
      const source: Record<string, unknown> = { ExpressMiddlewarePostAuth: [mw2] };

      mergeExtensibilityOptions(target, source);

      expect(target.ExpressMiddlewarePostAuth).toEqual([mw1, mw2]);
    });

    it('should create array when target has no existing value', () => {
      const hook = () => {};
      const target: Record<string, unknown> = {};
      const source: Record<string, unknown> = { PreRunViewHooks: [hook] };

      mergeExtensibilityOptions(target, source);

      expect(target.PreRunViewHooks).toEqual([hook]);
    });

    it('should preserve existing target array when source has no value', () => {
      const hook = () => {};
      const target: Record<string, unknown> = { PreRunViewHooks: [hook] };
      const source: Record<string, unknown> = {};

      mergeExtensibilityOptions(target, source);

      expect(target.PreRunViewHooks).toEqual([hook]);
    });

    it('should handle multiple keys at once', () => {
      const mw = () => {};
      const hook = () => {};
      const plugin = {};
      const target: Record<string, unknown> = {};
      const source: Record<string, unknown> = {
        ExpressMiddlewareBefore: [mw],
        PreRunViewHooks: [hook],
        ApolloPlugins: [plugin],
      };

      mergeExtensibilityOptions(target, source);

      expect(target.ExpressMiddlewareBefore).toEqual([mw]);
      expect(target.PreRunViewHooks).toEqual([hook]);
      expect(target.ApolloPlugins).toEqual([plugin]);
    });
  });

  describe('Multiple merge calls accumulate', () => {
    it('should accumulate across multiple merges', () => {
      const mw1 = () => {};
      const mw2 = () => {};
      const mw3 = () => {};
      const target: Record<string, unknown> = {};

      mergeExtensibilityOptions(target, { ExpressMiddlewarePostAuth: [mw1] });
      mergeExtensibilityOptions(target, { ExpressMiddlewarePostAuth: [mw2, mw3] });

      expect(target.ExpressMiddlewarePostAuth).toEqual([mw1, mw2, mw3]);
    });

    it('should accumulate different keys independently', () => {
      const pre = () => {};
      const post = () => {};
      const target: Record<string, unknown> = {};

      mergeExtensibilityOptions(target, { PreRunViewHooks: [pre] });
      mergeExtensibilityOptions(target, { PostRunViewHooks: [post] });

      expect(target.PreRunViewHooks).toEqual([pre]);
      expect(target.PostRunViewHooks).toEqual([post]);
    });
  });

  describe('Edge cases', () => {
    it('should ignore non-array source values', () => {
      const target: Record<string, unknown> = {};
      const source: Record<string, unknown> = {
        PreRunViewHooks: 'not an array',
        PostRunViewHooks: 42,
        PreSaveHooks: null,
      };

      mergeExtensibilityOptions(target, source);

      expect(target.PreRunViewHooks).toBeUndefined();
      expect(target.PostRunViewHooks).toBeUndefined();
      expect(target.PreSaveHooks).toBeUndefined();
    });

    it('should ignore keys not in MERGEABLE_KEYS', () => {
      const target: Record<string, unknown> = {};
      const source: Record<string, unknown> = {
        SomeRandomKey: ['value'],
        ConfigureExpressApp: () => {},
      };

      mergeExtensibilityOptions(target, source);

      expect(target.SomeRandomKey).toBeUndefined();
      expect(target.ConfigureExpressApp).toBeUndefined();
    });

    it('should handle empty source arrays', () => {
      const hook = () => {};
      const target: Record<string, unknown> = { PreRunViewHooks: [hook] };
      const source: Record<string, unknown> = { PreRunViewHooks: [] };

      mergeExtensibilityOptions(target, source);

      // Empty array merged = original preserved
      expect(target.PreRunViewHooks).toEqual([hook]);
    });

    it('should handle both target and source empty', () => {
      const target: Record<string, unknown> = {};
      const source: Record<string, unknown> = {};

      mergeExtensibilityOptions(target, source);

      // Nothing should be created
      expect(Object.keys(target)).toHaveLength(0);
    });

    it('should merge all MERGEABLE_KEYS correctly', () => {
      const fns = MERGEABLE_KEYS.map(() => () => {});
      const target: Record<string, unknown> = {};
      const source: Record<string, unknown> = {};

      MERGEABLE_KEYS.forEach((key, i) => {
        source[key] = [fns[i]];
      });

      mergeExtensibilityOptions(target, source);

      MERGEABLE_KEYS.forEach((key, i) => {
        expect(target[key]).toEqual([fns[i]]);
      });
    });
  });
});
