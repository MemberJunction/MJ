/**
 * @memberjunction/excel-addin — the Excel add-in's browser-safe half.
 *
 * - `contract`: the Open in Excel workbook format, shared with the server and the pane.
 * - `operations`: the typed Remote Operations Explorer calls.
 * - `handoff`: the encrypted sign-in handoff between Explorer and the pane.
 * - `client`: the status cache and download helper the grids use.
 *
 * The pane itself is bundled to `dist/web` and served by `@memberjunction/excel-addin-server`.
 */
export * from './contract';
export * from './operations';
export * from './handoff';
export * from './client';
