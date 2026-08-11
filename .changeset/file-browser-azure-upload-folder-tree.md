---
"@memberjunction/ng-file-storage": patch
---

Fix the Explorer File Browser for Azure Blob (and S3) storage accounts:

- **Upload verb/headers.** `file-grid` `uploadFileToUrl` hardcoded `POST`, which Azure and S3 reject (Azure "Put Blob" requires `PUT` **and** the `x-ms-blob-type: BlockBlob` header). It now selects the verb by provider `ServerDriverKey` — `POST` for Dropbox temporary upload links, `PUT` otherwise — and sends `x-ms-blob-type: BlockBlob` for Azure. Previously an Azure/S3 upload appeared to succeed (local progress bar) but silently created no blob. (Note: the browser PUTs directly to the pre-authenticated Azure URL, so the storage account also needs CORS rules for the Explorer origin.)
- **Folder-tree nested listing.** `folder-tree` `loadFolders` passed `currentPath` verbatim (with a leading slash, e.g. `/test`) as the storage list prefix. Blob keys have no leading slash, so nested-folder listings matched nothing and rendered empty folder names. The prefix is now normalized to slash-free with a trailing slash.
