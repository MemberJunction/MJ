# Content Autotagging Guide (Merged into Content Pipeline Guide)

> [!IMPORTANT]
> **This guide has been merged into the [Content Pipeline, Training, and Retrieval Guide](CONTENT_PIPELINE_GUIDE.md).**
>
> Content autotagging, source-type drivers (`AutotagBase.Discover` / `Fetch`), the managed `"Content Autotagging"` prompt (`ManagedPromptClassifier` / `ContentAutotagPrompt`), custom `MJ: Content Type Attributes` extraction, taxonomy bridging (`ContentItemTagBridge`), vector index resolution (`ContentVectorInfrastructure`), and RAG+ retrieval are now documented in one place:
> - **[Content Pipeline, Training, and Retrieval Guide](CONTENT_PIPELINE_GUIDE.md)** — Architecture, `WorkingRecord` & `ConfidenceScale`, 5-level configuration cascade, stage-by-stage reference (`Discover`/`Sync`, `Extract`, `Tag`, `Segment`, `Embed`, `Delete`), prompt & taxonomy bridge reference, source configuration (`IContentSourceConfiguration`), and Search/RAG+ retrieval.
> - **[Taxonomy & Tagging Guide](TAXONOMY_TAGGING_GUIDE.md)** — How the formal `MJ: Tags` taxonomy is governed, scoped, embedded, and resolved.
> - **[Content Segmentation Guide](CONTENT_SEGMENTATION_GUIDE.md)** — How text and media are split into chunks via `@memberjunction/ai-segmentation`.
