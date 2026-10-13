import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    // Type-level tests (`*.test-d.ts`). Ordinary vitest transpiles without checking types, so a
    // generated type that silently widened — say a related-record collection degrading from
    // `RelatedRecordCollection<MJActionParamEntity>` to `<BaseEntity>` — would compile, pass every
    // runtime test, and only surface as `any`-shaped code at some call site much later. These files
    // are checked by tsc, so that regression fails here instead.
    typecheck: {
      enabled: true,
      include: ['src/__tests__/**/*.test-d.ts'],
      // NOT ./tsconfig.json — that one excludes src/__tests__, which makes the typecheck
      // program empty and every assertion below vacuously true. Verified by widening a generic
      // and confirming these tests then fail.
      tsconfig: './tsconfig.typecheck.json',
    },
    coverage: {
      provider: 'v8',
      enabled: false,
    },
  },
});
