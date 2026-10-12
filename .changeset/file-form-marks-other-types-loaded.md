---
"@memberjunction/ng-core-entity-forms": patch
---

The Files form no longer stays on "Loading…" for a file it can't preview, and stops reading two fields the entity doesn't have.

The viewer learns that an image, PDF, video or audio file has loaded from its element's `load` event, and reads text by fetch. Any other type (a `.docx`, `.xlsx`, `.zip`) has no element: its view is the fallback card with *Open in Browser*, but nothing ever set `IsMediaLoaded`, so the loading overlay covered that card for good. The form now marks such a file loaded as soon as its URL is known (`MediaLoadsByElement`).

`MJ: Files` records no size and its created stamp is `__mj_CreatedAt`, so the form showed "0 B" and a blank *Created* for every file. The size badge and row appear only when a size is known (`DescribeFileSize`), and *Created* reads the real column.
