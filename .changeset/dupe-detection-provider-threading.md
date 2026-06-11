---
"@memberjunction/ai-vectors": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/core-entities-server": patch
---

Thread the request-scoped IMetadataProvider through the duplicate-detection stack instead of falling back to the process-global provider. VectorBase now accepts a provider in its constructor and its Provider setter rebinds the internal RunView; the Metadata getter returns the provider-aware IMetadataProvider. EntityVectorSyncer forwards the provider through its constructor, DuplicateRecordDetector passes its provider to the syncer it spawns, and MJDuplicateRunEntityServer passes this.ProviderToUse into the detector and its RunView. The run-dupe-detection CLI harness uses the provider returned by setupSQLServerClient directly. Note: VectorBase.Metadata's declared type changed from the concrete Metadata wrapper to IMetadataProvider.
