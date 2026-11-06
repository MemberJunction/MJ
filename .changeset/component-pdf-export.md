---
"@memberjunction/ng-react": minor
"@memberjunction/ng-artifacts": minor
---

Component artifacts can be exported as PDF. The artifact viewer header offers **PDF – Portrait** and **PDF – Landscape**, backed by the new `MJReactComponent.CapturePDF(orientation, title)`: the component is laid out at the A4 page's printable width (so the PDF is the same whatever the viewer's size), inner scroll areas are expanded, Chart.js charts are re-rendered sharp, and page breaks keep charts, rows, table lead-ins and headings together, shrinking a page by up to 20% rather than leaving it mostly empty. The host page is not changed during capture. Viewer plugins opt in through `SupportsPDFExport` / `ExportPDF(orientation)` on `BaseArtifactViewerPluginComponent`. ng-react adds `html-to-image` and writes the PDF itself (`BuildImagePdf`), with no PDF library.

Registry component metadata (`metadata/components`) changes, so the release needs a metadata migration: the new **ExportableData** wrapper (Generic/UI/Export) adds a CSV/Excel/PNG export icon to any data element; **DataGrid**, **EntityDataGrid** and **SimpleChart** export themselves (CSV and Excel, plus PNG for charts), with primary keys left out of exported columns; **DataExportPanel** is marked deprecated in its descriptions and stays Published so existing components keep working.
