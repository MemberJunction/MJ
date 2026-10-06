---
"@memberjunction/server": patch
"@memberjunction/ng-user-avatar": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/integration-test-suite": patch
---

Users can change their own avatar on deployments that do not let them update `MJ: Users`.

My Profile and the login avatar sync used to save the caller's own `MJ: Users` row, which needs Update permission on `MJ: Users`. A locked-down deployment cannot grant that: a row filter restricts rows, not columns, so a user who may update their own row may also rewrite their own `Email`. There, every avatar save failed ("Failed to save avatar") and the login sync failed silently.

- `@memberjunction/server`: new `UpdateMyAvatar(ImageURL, IconClass)` mutation returning `UpdateMyAvatarResult { Success, ErrorMessage }`. The caller comes only from the request; their own row is loaded as the system user and only `UserImageURL` and `UserImageIconClass` are written. Input is validated by the exported `ValidateAvatarInput`: a PNG/JPEG/GIF/WEBP base64 data URI of at most 200KB decoded, or an absolute http(s) URL of at most 2048 characters; a lower-case Font Awesome class list of at most 100 characters. `javascript:`, SVG and every other `data:` type are refused. Null clears a column. Scope-limited (magic-link) sessions are refused: an anonymous guest is the shared Anonymous user. Save failures return a generic message; the detail is logged.
- `@memberjunction/ng-user-avatar`: `UserAvatarService.UpdateMyAvatar(imageURL, iconClass, provider?)` calls the mutation. `SyncFromImageUrl` uses it instead of `user.Save()`, refuses any user other than the signed-in one, and reloads the entity afterwards. The package now depends on `@memberjunction/graphql-dataprovider`.
- `@memberjunction/ng-explorer-settings`: My Profile save and Revert to Default use the mutation, reload the user afterwards, and show the server's message on failure.
- `@memberjunction/ng-explorer-core`: after an avatar change the shell also refreshes the user menu's context user entity, so `GetUserDisplayInfo()` stops returning the old avatar.
- `@memberjunction/integration-test-suite`: IT105 (`self-avatar-client`, AV1–AV6, mutation tier) proves the mutation over the wire for a user without and a user with Update on `MJ: Users`, using two new seeded `it-avatar-*` users in `metadata-optional/integration-test`. `fls-client.checks.ts` now exports its user-API-key helpers for reuse.

Behaviour change: an avatar image larger than 200KB, or one served as a non-image content type, is now refused by the server, including on the login sync.
