---
"@memberjunction/storage": patch
---

Google Drive storage works with a service account (#3847).

- A credential record can carry service-account material (`keyFile`, `credentialsJSON`) as well as OAuth2. A record with no auth material keeps the client the server built from environment configuration, and logs a warning saying so.
- Uploads stream the payload, so a service account's upload no longer fails after authentication and folder creation.
- Shared Drives are supported. Every request carries `supportsAllDrives`, and a new `driveID` setting (`STORAGE_GDRIVE_DRIVE_ID`, or `driveID` on a credential record) names the Shared Drive. It becomes the default root, and a credential record's `driveID` replaces the server-wide drive and root folder. A service account has no storage quota of its own, so it can only upload to a Shared Drive.
- `IsConfigured` is true for a service-account client, so search indexing and content autotagging no longer skip a working service-account Drive account.
