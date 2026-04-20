Multi-format export component supporting CSV, Excel (XLSX), and PDF with two modes: UI (dropdown button with format selection) or headless (programmatic export). Exports tabular data (array of objects + column definitions) OR HTML elements (charts, dashboards) to PDF via html2canvas. Column selection, preview, custom formatting (dates, numbers, currency). PDF features: orientation (portrait/landscape), page size (A4/letter), margins, multi-page support, data table inclusion, AI insights markdown rendering. Excel: auto-width columns, filters, custom sheet names. CSV: proper escaping, chunked processing for large datasets. Progress tracking and error callbacks.

#### DataExportPanel - ONLY use when:
✅ Need to export tabular data (array of records) to CSV/Excel/PDF
✅ Want to export visualizations (charts, dashboards) as PDF snapshots
✅ Need user-facing export UI with dropdown button
✅ Need programmatic export (headless mode for background jobs)
✅ Exporting AI insights as markdown text in PDF
✅ Need column selection, preview, or custom formatting

❌ DO NOT USE DataExportPanel when:
- Exporting a single value or simple text → Use clipboard API or browser download API directly
- Need formats other than CSV/Excel/PDF → Use specialized export libraries
- Exporting from external APIs → Fetch data first, then pass to DataExportPanel
- Need real-time streaming export → DataExportPanel loads all data into memory
- Complex multi-sheet Excel workbooks → Use XLSX library directly

**Use Cases**: Dashboard export buttons, report download functionality, 'Export to Excel' from data grids, saving AI-generated insights as PDF with visualizations, bulk data extraction for users.
