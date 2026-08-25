---
"@memberjunction/ng-artifacts": patch
---

Fix downloading a file artifact producing an unopenable text file

`onDownloadVersion` wrote the version's `Content` string out verbatim as `text/plain`, named `<artifact>_v<n>.txt`. An artifact version holding a file stores it as a `data:<mime>;base64,…` URI — which MJ uses whenever no file storage account is configured — so "download" produced a text file full of base64 with a misleading name, and opening the supposed document gave an invalid-file-format error. The stored bytes were always correct; only the download was wrong.

A data URI is now decoded to real bytes, given its own MIME type, and saved under the version's `FileName`. Text content (Markdown, JSON, code) keeps its previous behaviour, and now honours its declared MIME type and filename where present.

The rules live in `buildVersionDownload` (`artifact-version-download.ts`) so they are unit-testable without Angular; 6 tests added, mutation-checked.
