---
"@memberjunction/core-actions": minor
"@memberjunction/document-parsing": minor
"@memberjunction/network-utils": minor
"@memberjunction/content-pipeline": minor
"@memberjunction/content-pipeline-base": minor
---

The Html extractor decodes a page by its byte-order mark, else the charset it was served with (`ExtractRequest.ContentType`, new), else its own `<meta>` declaration (a declared UTF-16 means UTF-8, per the HTML standard; a declaration in a comment or inside another attribute's text does not count), else UTF-8, so a windows-1252 page keeps its accented letters. `ExtractorOptions.Html.TitleSelector` takes the title from an element instead of `<title>` when the site's `<title>` is the same on every page; a selector that is not valid CSS is reported. `network-utils` gains `KnownCharset` and `CharsetOfContentType`, the one charset reader the HTTP client, the Html extractor and the website crawl share.

The content-type helpers (`IsImageContentType`, `IsTextContentType`, `IsPdfContentType`, `IsSpreadsheetContentType`, `IsWordContentType`) move from `@memberjunction/document-parsing`, which never used them itself, to `@memberjunction/network-utils` (no dependencies), with a new `IsDocumentContentType` built from them. **document-parsing no longer exports them: code that imported them from `@memberjunction/document-parsing` must import them from `@memberjunction/network-utils`** (Get File Content now does).
