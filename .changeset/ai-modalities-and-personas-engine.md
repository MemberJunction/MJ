---
"@memberjunction/core-entities": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/ai-agents": minor
---

Implement modality inheritance, AI Persona metadata catalog, and persona resolution across BaseAIEngine and realtime agents.

- BaseAIEngine: implement modality inheritance according to Agent -> Model -> System -> Default precedence, honoring InheritTypeModalities, AIModelType default input/output modalities, and junction IsSupported = 0 / IsAllowed = 0 vetoes.
- BaseAIEngine: cache and resolve AI Personas (GetModelPersonas, GetAgentPersonas, ResolveAgentPersona) incorporating agent style overrides and sequence ordering.
- AIEngine: delegate persona and modality getters and helper methods to BaseAIEngine.
- AIAgents: update GetRealtimeModelVoices to consult metadata personas first before falling back to driver SupportedVoices.
- Metadata: seed canonical modalities (metadata/ai-modalities/) and initial personas (metadata/ai-personas/, metadata/ai-persona-vendors/, metadata/ai-model-personas/, metadata/ai-agent-personas/).
- JSONType: simplify IAIPersonaVendorSettings to eliminate duplicate flat members and vendor namespacing.
