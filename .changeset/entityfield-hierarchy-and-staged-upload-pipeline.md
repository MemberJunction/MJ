---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
"@memberjunction/storage": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-base-types": patch
"@memberjunction/ng-file-storage": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-shared": patch
"@memberjunction/ng-gantt": patch
"@memberjunction/ng-notifications": patch
---

feat(storage,core,forms): ephemeral staged binary upload pipeline, polymorphic related collections, and file record viewer

- **Storage & Server**:
  - Implement Tier 2 ephemeral staged raw binary upload pipeline (UploadTokenManager, POST /media/upload-stage, CreateUploadStageToken mutation, UploadStorageFile token consumption).
  - Add single-use cryptographic token security, user identity ownership binding, automated TTL eviction, and memory bounds.
  - Sanitize paths/filenames and add X-Content-Type-Options: nosniff to /media endpoints.
- **Core & ORM**:
  - Add support for polymorphic IS-A subtypes in RelatedRecordCollection and dirty state preservation across relationship chains.
  - Support IEntityConfiguration and entity hierarchy traversal.
- **Angular & UI**:
  - Add 3-tier upload pipeline in RecordAttachmentsComponent with real-time wire progress.
  - Add dedicated MJ: Files custom record viewer form component in ng-core-entity-forms.
  - Add attachment count badges to base form container and toolbar.
  - Add ResizeObserver lifecycle handling to Gantt chart and OpenNewEntityRecord in SharedService.
