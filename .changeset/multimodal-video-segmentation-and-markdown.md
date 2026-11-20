---
"@memberjunction/core": minor
"@memberjunction/ai-segmentation": minor
"@memberjunction/content-pipeline": minor
"@memberjunction/ng-markdown": minor
"@memberjunction/server": minor
---

Add WebVTT/SubRip caption cue parsing (`ParseCaptionCues`, `LooksLikeCaptionText`) and raw caption text fallback to `TranscriptSegmenter`, register `VTT` and `SRT` in `MJ: Content File Types` metadata, persist multimodal chunk fields (`StartMs`, `EndMs`, `StartOffset`, `EndOffset`, `PageNumber`, `SegmentTitle`, `Transcript`, `SegmenterKey`, `ParentChunkID`) through `SegmentStage`, `PipelineProcessor`, `WorkingRecordHydrator`, and `EmbedStage`, export `UploadTokenManager` from `@memberjunction/server`, and add `EnableInlineMedia` support to `@memberjunction/ng-markdown` to upgrade `/media/:fileId` video tags into HTML5 `<video>` players with WebVTT caption tracks and a lazy click-to-seek transcript drawer.
