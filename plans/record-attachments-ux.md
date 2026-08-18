# Generic Record Attachments (File Links UX)

**Goal.** A paperclip on the form toolbar of any record. Click it, a panel slides in listing every
file attached to that record — across all storage providers — with preview, download, and upload.
Per-entity opt-in, default off. Invisible when the instance has no storage configured.

## Headline finding: ~80% of this is already built

The pieces exist — they were wired for *artifacts* and *agent recordings*, not for records.

| Need | Already exists | Verdict |
|---|---|---|
| Link a file to any record | `MJ: File Entity Record Links` (FileID, EntityID, RecordID) | as-is |
| Storage accounts/providers, **client-side** | `FileStorageEngineBase` (`BaseEngine`, `CacheLocal`, in `core-entities`) | as-is |
| Reference write path: upload → File row → link | `storeRealtimeRecording()` (`AI/Agents/src/realtime/realtime-recording-store.ts:214`) | copy |
| Authenticated same-origin byte URL, any MIME, Range | `CreateMediaAccessToken` → `GET /media/:fileId?token=` (`FileResolver.ts:402`) | as-is |
| Viewers: pdf, docx, xlsx, image, svg, video, audio, md, json | `Angular/Generic/artifacts/.../components/plugins/*` (pdfjs + mammoth already deps) | extend |
| Resizable slide-in panel | `<mj-slide-panel>` (`ui-components/src/lib/slide-panel/`) | as-is |
| Toolbar button + count badge + entity-flag gate | Tags/History buttons in `base-forms/.../toolbar/form-toolbar.component.*` | copy |
| Per-entity bit: default-off + backfill + CodeGen default | `V202604131300__v5.26.x__Add_AllowCaching_And_DetectExternalChanges…sql` | copy |

`FileEntityRecordLink` is not dormant-and-broken — it has one live producer (agent session
recordings) and it works.

## What's missing

**(a)** No UI surface — `ng-file-storage` is a global file *browser* (and drags in `ag-grid`), not a
per-record panel. **(b)** No entity opt-in flag on `MJ: Entities`. **(c)** No client-callable
"attach to this record" API: `FileStorageEngine.UploadFile()` is server-only, neither client path
creates a link, and `CreatePreAuthUploadUrl` is documented as *"does NOT create a File entity
record"*. **(d)** Viewers are welded to artifacts — they take `@Input() artifactVersion!:
MJArtifactVersionEntity`.

## Design

**New package `@memberjunction/ng-record-attachments`** (L2 generic), modeled line-for-line on
`ng-record-tags`. `base-forms` takes a dependency on it — it already depends on `ng-record-tags`,
`ng-record-changes`, and `ng-list-management`, so this is the established pattern. It must **not**
depend on `ng-file-storage` (ag-grid) or `@memberjunction/storage` (server SDKs).

**Toolbar.** Add `ShowAttachmentsButton` to `FormToolbarConfig` (`types/toolbar-config.ts`) plus
`@Input() AttachmentCount` / `@Output() AttachmentsPanelToggled` — an exact clone of the Tags trio.
Visibility mirrors the History button (`form-toolbar.component.ts:288`, `.html:54`) —
`@if (Config.ShowAttachmentsButton && SupportsAttachments && HasStorageAccounts)`, where
`SupportsAttachments` is the new `EntityInfo` flag and `HasStorageAccounts` is
`FileStorageEngineBase.Instance.AccountsWithProviders.length > 0`. That makes the zero-provider case
free, with no new API.

**Panel.** `<mj-record-attachments>` wrapping `<mj-slide-panel>`, rendered from
`container/record-form-container.component.html` beside `<mj-record-tags>` (~line 308). The count
badge follows `LoadTagCount()` (`…component.ts:1248`) — including its comment about *not* narrowing
`Fields`, which poisons the server's RunView cache.

**Read path.** One batched `RunViews`: links filtered
`EntityID='…' AND RecordID='<record.PrimaryKey.Values()>'` (the canonical composite-key
serialization, same as tags), then `MJ: Files` by `FileID IN (…)`. Since each `MJ: Files` row carries
its own `ProviderID`, the unified multi-provider list is **one query, not a fan-out**.

**Write path.** Two-step, so bytes never transit the API: `CreatePreAuthUploadUrl` (account-based,
Credential-Engine credentials) → client PUTs → new mutation **`RegisterRecordAttachment`** creates
the `MJ: Files` row and the link together. This is `storeRealtimeRecording` split across the wire.

## Entity opt-in

```sql
ALTER TABLE ${flyway:defaultSchema}.Entity ADD SupportsFileAttachments BIT NOT NULL
    CONSTRAINT DF_Entity_SupportsFileAttachments DEFAULT 0;                        -- GO
UPDATE ${flyway:defaultSchema}.Entity SET SupportsFileAttachments = 1 WHERE Name IN (…);
EXEC sp_addextendedproperty …;   -- required; CodeGen reads it as the field Description
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntities';
```

One column, no `AutoUpdate…` twin — that twin exists only where CodeGen LLM-infers a value
(`SupportsGeoCoding`). Then `mj sync push`, then `mj codegen`, in that order.

**CodeGen will not stomp a hand-set flag:** `createNewEntityInsertSQL()`
(`CodeGenLib/src/Database/manage-metadata.ts:6530`) is INSERT-only, for brand-new entities. Adding
`newEntityDefaults.SupportsFileAttachments` — plus an optional `…BySchema` override copying
`resolveAllowCachingForSchema()` (line 6590) — gives "on for new, off for existing" exactly as asked,
and lets a downstream app set its own default in `mj.config.cjs`. The flag reaches `EntityInfo`
automatically; apps flip individual entities via metadata sync.

## Preview: phase it, and buy nothing

`GET /media/:fileId?token=` serves **any** content type with the file's own MIME plus Range support —
the "media" name undersells it. So the first cut needs zero new dependencies: images via `<img>`, PDF
via `<iframe>` (browser-native viewer), audio/video via `MJStorageMediaPlayerComponent`,
text/markdown via fetch + the already-present `ng-markdown`; everything else gets a type icon and a
download. docx/xlsx/code/json come later, by generalizing `BaseArtifactViewerPluginComponent` off
`MJArtifactVersionEntity` onto a content-source interface and resolving a viewer by MIME through
`MJGlobal.Instance.ClassFactory` — the registry those plugins already use.

## Phases

| # | Scope | Done when |
|---|---|---|
| 1 | Migration + CodeGen default + `EntityInfo` flag | An entity can be marked attachment-capable; nothing renders yet |
| 2 | `ng-record-attachments` read-only panel + toolbar button + badge | Paperclip shows only for opted-in entities with storage; lists + downloads links |
| 3 | Upload (`RegisterRecordAttachment`), delete, drag-and-drop, account picker | Users add and remove attachments on any opted-in record |
| 4 | Inline preview — the zero-dependency types, then the viewer registry | PDFs and images preview in-panel without leaving the form |

Each phase is independently shippable and its own PR. Phase 2 is useful alone — agent session
recordings already produce links.

## Risks

1. **The permission model is wrong for this use case.** `CreateMediaAccessToken` gates on loading the
   `MJ: Files` row under the user's context — on *Files* permission, not the host record's
   readability. Someone who can read Files could read an attachment on an Account they can't see.
   *Fix:* gate the panel read and `RegisterRecordAttachment` on the host entity. **Blocks phase 2.**
2. **`MJ: Files` has `ProviderID` but no `AccountID`.** With two accounts on one provider,
   `ResolveStorageAccount()` picks "first active" and download can hit the wrong one. *Fix:* add
   `FileStorageAccountID` (additive) in phase 3; until then, one account per provider in the picker.
3. **Two divergent upload paths** — `CreateFile` (env-var creds) vs `CreatePreAuthUploadUrl`
   (Credential Engine). The legacy one is a dead end; this design commits to the account path.
4. **Bearer-token URLs.** `/media` mounts before auth middleware, no row-level re-check. *Fix:* short
   TTL, never log the URL, keep it out of browser history.
5. **Dependency creep into `base-forms`** — every form in every MJ app pays. *Fix:* hold the new
   package's deps at the `ng-record-tags` level; ag-grid and pdfjs stay behind lazy phase-4 viewers.

## Decisions I need from you

1. **Permission semantics** (risk 1): gate on the *host record* (my recommendation) or on
   `MJ: Files`? Shapes the API — phase-2 blocking.
2. **The curated on-list.** Which MJ entities ship with the flag set? My default: nothing in `__mj`
   beyond AI Agent Sessions, Conversations, and Tasks — metadata tables stay off.
3. **New-entity default.** You leaned on; I'd ship phase 1 *off* and flip it once the panel exists,
   so the flag never advertises UI that isn't there.
