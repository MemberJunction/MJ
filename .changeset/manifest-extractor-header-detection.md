---
"@memberjunction/content-pipeline": minor
---

The Manifest extractor can now tell manifests from datasets and give rows stable identities. With `ExtractorOptions.Manifest.DetectByHeader`, a CSV whose header names none of the `DetectionColumns` (default: the link, text and fallback link columns) is read as one ordinary document instead of failing, so one source can receive both. `FallbackLinkColumns` give a row without text further columns to fetch from; `KeyColumns` identify a row without a link by the first column, or composite of columns joined by `KeySeparator`, that has a value, instead of its position; and `KeyAsURL` makes that key the child item's URL rather than `<manifest URL>#<key>`. With none of these set, behaviour is unchanged.
