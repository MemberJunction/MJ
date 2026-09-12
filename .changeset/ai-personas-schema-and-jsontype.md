---
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add AI Persona foundation schema (`AIPersona`, `AIPersonaVendor`, `AIModelPersona`, `AIAgentPersona`) and strongly typed JSONType interfaces (`IAIPersonaStyleDescriptors`, `IAIPersonaVendorSettings`, `IAIAgentPersonaStyleOverride`).

- Introduce `AIPersona` catalog table with deterministic global name uniqueness for cross-modality catalog curation.
- Introduce `AIPersonaVendor` for concrete vendor and modality bindings with typed `VendorSettingsObject` (`IAIPersonaVendorSettings` with native ElevenLabs settings).
- Introduce `AIModelPersona` for model availability and priority sequences.
- Introduce `AIAgentPersona` for agent persona assignments with filtered unique index `UQ_AIAgentPersona_OneDefaultPerAgent` and typed `StyleOverrideObject` (`IAIAgentPersonaStyleOverride`).
- Add strongly-typed `<Field>Object` accessors in `MJAIPersonaEntity`, `MJAIPersonaVendorEntity`, and `MJAIAgentPersonaEntity`.
- Scope CodeGen remote operations emission to `includeSchemas` and partition core vs non-core operations.
