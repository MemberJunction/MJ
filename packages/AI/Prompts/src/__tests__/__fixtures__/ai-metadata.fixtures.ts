/**
 * COMPATIBILITY SHIM — the realistic AI-metadata catalog fixture now lives in
 * the shared test harness: `@memberjunction/unit-testing` (src/ai/catalog-fixtures).
 *
 * This module re-exports it so existing test imports keep working. It is a
 * test-internal delegation, not a package public API. New tests should import
 * from '@memberjunction/unit-testing' directly.
 */
export {
  VENDOR_TYPE,
  VENDOR,
  MODEL_TYPE,
  CONFIG,
  MODEL,
  makeModelVendor,
  makeModel,
  makePromptModel,
  buildRealisticCatalog,
  DEFAULT_CONFIGURED_DRIVERS,
} from '@memberjunction/unit-testing';
export type {
  FxVendorType,
  FxVendor,
  FxModelType,
  FxConfiguration,
  FxModelVendor,
  FxModel,
  FxPromptModel,
  AICatalog,
} from '@memberjunction/unit-testing';
