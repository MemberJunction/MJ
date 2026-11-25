---
"@memberjunction/content-pipeline": patch
"@memberjunction/integration-test-suite": patch
---

Content pipeline: Segment chooses the cleaner by the item's detected file type. A `Cleaners` map in the configuration JSON, keyed by file type (`{ "html": "Html", "pdf": "MyPdfCleaner" }`), can sit on the run, the Content Source and the Content Type (or its source type's configuration). Until now one cleaner served every item of a source, so a source holding pages, PDFs and text files (an SFTP drop, a document library) cleaned them all the same way.

Segment takes the first of: the run's entry for the file type, then the run's `CleanerKey`; the Content Source's entry for the file type; the Content Type's entry for the file type, then the Content Source Type's (the standard cleaner for that kind of file); the source's `CleanerKey`, now its default for a file type nothing maps or an item whose type was not detected; the content type's `CleanerKey` (now also read from its `Configuration`), then the source type's; and finally `Html` for markup, `PlainText` otherwise. A source overrides the standard cleaner for one file type by naming it in its own map. A cleaner key that is not registered is skipped with one warning and the next choice applies; when none applies, markup is cleaned as HTML (it used to fall to `PlainText`).

File types match case-insensitively and with or without a leading dot, and an item loaded from the database (whose file type is its Content File Type's name, `HTML`, or for a custom type perhaps `Word Document`) is matched by the same key as one Extract just detected (`html`, `docx`). Nothing changes for a configuration without a `Cleaners` map: the plain keys keep their order (run, source, content type).

Integration coverage: `content-pipeline.CP23` runs one source's HTML, text and Markdown items through the real Discover, Extract and Segment stages and checks each is cleaned by the cleaner the order above chooses, with the file type read back from the database.
