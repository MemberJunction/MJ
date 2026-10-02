---
"@memberjunction/predictive-studio": patch
---

Predictive Studio now stores trained model artifacts in MJStorage instead of the training host's local disk, so a model trained on one host scores on any host that shares the database and storage provider, and clearing the training host's temp directory no longer breaks scoring (#4991). Training uploads the bytes to a File Storage Account and records the `MJ: Files` row's `ProviderKey`. Each server downloads an artifact from that row's provider the first time it scores the model and keeps a copy under `PS_ARTIFACT_DIR` (set it to a persistent path on servers), so later scores read from local disk. Training now needs a File Storage Account and fails with an error saying so when none is configured. Models trained before this change still score on the host that trained them; retrain them to move their artifacts to storage.
