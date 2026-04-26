---
"@memberjunction/ai-agents": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Activate Memory Manager consolidation pipeline with drift prevention, entity-attribute contradiction detection, Ebbinghaus decay-based archival, protection tiers, and composite importance scoring. Adds the `AIAgentNote` consolidation schema (`ConsolidatedIntoNoteID`, `ConsolidationCount`, `DerivedFromNoteIDs`, `ProtectionTier`, `ImportanceScore`) and enforces the vector-store Status invariant write-side in `MJAIAgentNoteEntityServer.Save()` / `.Delete()` so revoked notes are removed from retrieval without an MJAPI restart. Expands Memory Manager observability with per-phase run-step payloads: `scoreDistribution`, `entityTriplesExtracted`, `decayScoreDistribution`, `protectedPreserved`, `ephemeralAccelerated`, consolidation `triggerType` (forced/time/event/count), a new `Verify Consolidation Output` phase-level run step, and per-cluster `Process Consolidation Cluster` child steps. Adds 95th-percentile uniqueness outlier auto-protection in importance scoring. Deprecates the Memory Cleanup Agent in favor of the unified Memory Manager pipeline.
