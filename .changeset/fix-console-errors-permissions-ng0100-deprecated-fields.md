---
"@memberjunction/core-entities": patch
"@memberjunction/ng-shared": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/codegen-lib": patch
---

Fix Explorer console errors: grant UI role create/update permissions on MJ: User Record Logs and guard RecentAccessService.LogAccess, emit Conversations$ synchronously on optimistic SaveConversation updates and run change detection on conversation rename/creation callbacks to prevent NG0100, fall back to user-settings persistence in EntityViewerComponent when UserCanEdit is false on a loaded UserView, and hide/omit Deprecated and Disabled entity fields in MjFormFieldComponent and AngularClientGeneratorBase.
