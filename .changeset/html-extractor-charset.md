---
"@memberjunction/content-pipeline": minor
"@memberjunction/content-pipeline-base": minor
---

The Html extractor decodes a page by the charset it was served with (`ExtractRequest.ContentType`, new), else its own `<meta charset>`, else UTF-8, so a windows-1252 page keeps its accented letters. `ExtractorOptions.Html.TitleSelector` takes the title from an element instead of `<title>` when the site's `<title>` is the same on every page.
