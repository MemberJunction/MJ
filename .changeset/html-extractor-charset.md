---
"@memberjunction/core-actions": minor
"@memberjunction/document-parsing": minor
"@memberjunction/network-utils": minor
"@memberjunction/content-pipeline": minor
"@memberjunction/content-pipeline-base": minor
---

The Html extractor decodes a page by its byte-order mark, else the charset it was served with (`ExtractRequest.ContentType`, new), else its own `<meta charset>`, else UTF-8, so a windows-1252 page keeps its accented letters. `ExtractorOptions.Html.TitleSelector` takes the title from an element instead of `<title>` when the site's `<title>` is the same on every page; a selector that is not valid CSS is reported. `network-utils` gains `KnownCharset` and `CharsetOfContentType`, the one charset reader the HTTP client, the Html extractor and the website crawl share.

The content-type helpers (`IsImageContentType`, `IsTextContentType`, `IsPdfContentType`, `IsSpreadsheetContentType`, `IsWordContentType`) move from `@memberjunction/document-parsing`, which never used them itself, to `@memberjunction/network-utils` (no dependencies), with a new `IsDocumentContentType` built from them. document-parsing re-exports them, so existing imports keep working; Get File Content now imports them from network-utils.
