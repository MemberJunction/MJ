/**
 * @memberjunction/excel-addin-server — the Excel add-in's server half.
 *
 * - `ExcelAddinServerExtension`: serves the add-in (manifest, pane, sign-in pages) from this host.
 * - The `ExcelAddin.*` Remote Operation bodies: status, connection key, connected workbook.
 * - The manifest and workbook builders they use.
 *
 * The browser-safe half (the workbook contract, the typed operations, the pane) is
 * `@memberjunction/excel-addin`; import its types from there.
 */
export * from './settings';
export * from './runtime';
export * from './manifest-builder';
export * from './workbook-builder';
export * from './sources';
export * from './connection';
export * from './operations';
export * from './extension';
