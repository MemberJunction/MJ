---
"@memberjunction/storage": patch
---

Fix `AzureFileStorage` so DB-credential (enterprise) deployments work without `STORAGE_AZURE_*` env vars. The constructor previously called `env.get(...).required()` for account name / key / container and threw before `initialize()` could run — but `initializeDriverWithAccountCredentials` constructs the driver first and only then initializes it with the decrypted `FileStorageAccount` credential. So any FileStorageAccount-backed Azure usage (the Archiving engine, the Explorer File Browser) failed with `env-var: "STORAGE_AZURE_CONTAINER" is a required variable, but it was not set`. Credentials are now optional at construction: env/config values are read without `.required()`, and the Azure SDK clients are wired up only once account name + key are available (in the constructor when env/config supplies them, or later in `initialize()` from DB credentials). The env-var path is unchanged.
