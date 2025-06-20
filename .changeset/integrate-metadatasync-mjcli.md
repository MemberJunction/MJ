---
"@memberjunction/cli": patch
"@memberjunction/metadata-sync": patch
---

Integrate MetadataSync commands into MJCLI

- Refactored MetadataSync from standalone CLI to reusable library
- Moved all sync commands under `mj sync` namespace in MJCLI
- Added service-based architecture for better modularity
- Removed oclif dependencies from MetadataSync package