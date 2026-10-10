---
"@memberjunction/core-entities": minor
---

Personas can carry avatar settings. `MJ: AI Persona Vendors.VendorSettings` (`IAIPersonaVendorSettings`) gains `Avatar` for a persona's binding whose Modality is Video: `Kind` (`preset`, or `custom` from a reference image), `ReferenceImageFileID`, `Resolution` and `Background`. The persona's `StyleDescriptors` and the agent's persona `StyleOverride` gain `Visual`: `Framing` and the speaking ring's `AccentToken` (a design-token name). CodeGen regenerates the three typed accessors. No row sets them and nothing reads them yet.
