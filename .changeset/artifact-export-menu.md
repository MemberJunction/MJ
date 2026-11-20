---
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-app": patch
---

The artifact viewer header now has one Export menu in place of the PDF-only button. A viewer lists its formats with `GetExportOptions()` and runs the chosen one with `RunExport(key)`. By default these give the portrait and landscape PDF entries when `SupportsPDFExport` is true, so the Docs and Component viewers export as before. An option with a `DisabledReason` shows greyed out, with the reason in place of its description, and does not run.

Query (data) artifacts now export their results as Excel, CSV or JSON, and their query as a `.sql` file. A results export runs the query again without paging, up to 100,000 rows, through the grid's own export. A warning shows when that limit is hit or the query fails and only the rows on screen were exported. The same menu saves the query (save, update, or save as new), saves the records as a list, opens the saved query as a live Excel workbook when the server has the Excel add-in, and creates a Live Sheet (a Sheets artifact with a live table on the saved query). Excel (live) and Live Sheet need a saved query that matches the version on screen. The data toolbar no longer has the Save Query, Update Query and Save as List buttons; when the SQL has changed it shows an Open Query button next to its badge.

More viewers now list their exports in the same menu, through the export code they already had. Docs offer Word, Markdown and PDF. Sheets offer the workbook as Excel and the active sheet as CSV. Slides offer PowerPoint and a printable PDF. PDF, Word, Excel file, image, audio and video artifacts offer their original file. SVG, HTML, JSON and code artifacts save their source with the matching extension. The base viewer has `FILE_EXPORT_KEY` and protected `FileExportOption`, `OriginalFileName`, `ExportFileName` and `DownloadTextFile` helpers for this. The code viewer now detects JavaScript content as JavaScript; before, it showed it as Java. The Word (.docx) export of a Docs artifact now works in the browser; before, it failed with "nodebuffer is not supported by this platform".

`NavigationRequest` has optional `ArtifactID` and `ArtifactName`. The Conversations resource, the artifact tab, the dashboard chat pane and the chat overlay open that artifact in its own tab.

`LiveSheetClientToolHelper` and its helpers moved from `@memberjunction/ng-dashboards` to `@memberjunction/ng-artifacts`; import them from there. `@memberjunction/ng-query-viewer` now exports its Open in Excel parameter helpers (`HasRequiredParameterValues`, `ToExcelParameterValues`, `CanOpenQueryInExcel`).
