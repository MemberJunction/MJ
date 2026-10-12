---
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-core-entity-forms": patch
---

Word and Excel files preview inline in the Files form, through the renderers the Artifacts viewer already had (MJ#4957).

`@memberjunction/ng-artifacts` now exports `mj-docx-preview` (mammoth to sanitized HTML) and `mj-xlsx-preview` (SheetJS into an AG Grid with sheet tabs), each taking a URL or bytes and reporting `loaded` and `failed`. The Word and Excel artifact viewer plugins wrap them, so Explorer has one renderer of each kind.

The `MJ: Files` form recognises `.docx`, `.xlsx`, `.xlsm` and `.xls` by name as well as by MIME type, since the server stores Office files as `application/octet-stream`, and shows them in its preview pane with *Open in New Tab* kept for the download. Legacy `.doc` stays a download: mammoth reads OOXML only.
