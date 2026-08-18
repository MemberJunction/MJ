# Generic Record Attachments (File Links UX)

**Goal.** Files attached to any record, discovered automatically: a paperclip on the form toolbar, a
panel listing every file on that record across all storage providers, with preview, open/download, and
two ways to add one. Per-entity opt-in, default off. Invisible when the instance has no storage.

**Driving consumer.** `bizapps-contracts` [PR #6](https://github.com/MemberJunction/bizapps-contracts/pull/6)
drops its planned `Contract.ExecutedDocumentFileID` FK (ERD §9, R-8) for `FileEntityRecordLink` alone.
Its capability write-up reaches this plan's conclusion independently: *"a generic record-scoped
attachments panel is a small, obviously-useful contribution back to MJ, and contracts is the app that
most wants it."*

## Two headline findings

**1. ~80% of the file plumbing exists** — built for *artifacts* and *agent recordings*, never pointed
at records. `FileEntityRecordLink` has exactly one live writer today and it works.

| Need | Already exists | Verdict |
|---|---|---|
| Link a file to any record | `MJ: File Entity Record Links` (FileID, EntityID, RecordID) | extend |
| Storage accounts/providers, **client-side** | `FileStorageEngineBase` (`BaseEngine`, `CacheLocal`, in `core-entities`) | as-is |
| Reference write path: upload → File row → link | `storeRealtimeRecording()` (`AI/Agents/.../realtime-recording-store.ts:214`) | copy |
| Authenticated same-origin byte URL, any MIME, Range | `CreateMediaAccessToken` → `GET /media/:fileId?token=` (`FileResolver.ts:402`) | as-is |
| Viewers: pdf, docx, xlsx, image, svg, video, audio, md, json | `Angular/Generic/artifacts/.../plugins/*` (pdfjs + mammoth already deps) | extend |
| Per-entity capability bit, default-off + CodeGen default | `V202604131300__v5.26.x__Add_AllowCaching_And_DetectExternalChanges…sql` | copy |

No per-record UI exists — `ng-file-storage`'s `files-grid` / `file-upload` take **`CategoryID` only**,
making them a global file *browser* (and they drag in `ag-grid`).

**2. Amith's new forms system already has the auto-discovery mechanism** — a better fit than the
Tags-style wiring I first assumed. `FormPanelRegistrationMetadata`
(`base-forms/src/lib/panel-slot/base-form-panel.ts`, touched 2026-08-18) supports **`entity: '*'`** — an
entity-agnostic panel mounting on *every* form — and its docs state the contract: *"Wildcard panels are
expected to self-hide (render nothing) when they don't apply to the current record."* Discovery is
`ClassFactory.GetAllRegistrationsByMetadata`, so **`base-forms` needs no dependency on the attachments
package** — strictly better than cloning `ng-record-tags`, hardcoded into `record-form-container…html`.

## Design

**New package `@memberjunction/ng-record-attachments`** (L2 generic). One component, registered once:

```ts
@RegisterClassEx(BaseFormPanel, { key: 'record-attachments:panel',
  metadata: { entity: '*', slot: 'after-fields', sortKey: 30, inclusion: 'Primary' } })
```

`RegisterClass`'s second positional arg is `key: string | null` and `metadata` is its **sixth**
(`MJGlobal/src/RegisterClass.ts:51-62`), so the options bag only works on `RegisterClassEx` — which is
what all three existing panels in `core-entity-forms` use. **But the tree-shake manifest generator
matches the identifier literally** (`GenerateClassRegistrationsManifest.ts:461,569`:
`expression.text !== 'RegisterClass'`), so every `RegisterClassEx` registration is invisible to it:
`ModelPredictionPanel`, the repo's only other `entity: '*'` panel, has **zero** entries in
`Angular/Bootstrap/src/generated/mj-class-registrations.ts` and survives only because the manifest
imports its package barrel. A new standalone package has no such barrel — the panel silently never
registers and the paperclip opens nothing, with no build or runtime error. Teaching the generator
about `RegisterClassEx` is a one-line CodeGen fix that de-risks the three existing panels too; do it
in phase 2, or accept a dependency edge from an already-manifested package.

The slot host injects `Record`, `FormComponent`, and `FormContext` before first change detection — no
per-entity wiring, no CodeGen change. The panel self-hides when `!EntityInfo.SupportsFileAttachments` or
`FileStorageEngineBase.Instance.AccountsWithProviders.length === 0`, making the zero-provider case free
with no new API. Admins can already rename, move, or hide the rail section per entity via L3
`MJ: Form Chrome Rules`, which outranks the registration's `inclusion`.

**Toolbar paperclip.** Panels are pluggable but **toolbar buttons are not** — `FormToolbarConfig` is a
static interface whose only extension points are host-supplied `CustomButtons` / `AdditionalActions`. So
this is the one `base-forms` edit: `ShowAttachmentsButton` plus `@Input() AttachmentCount` /
`@Output() AttachmentsPanelToggled`, gated like the History button (`form-toolbar.component.ts:288`,
`.html:54`). It imports nothing from the new package — it calls
`FormChromeCoordinatorService.SetActiveGroup('attachments')` to jump to the rail section, and/or opens
the *same component* in `<mj-slide-panel>` for the slide-out you described.

**Read path.** One batched `RunViews`: links filtered
`EntityID='…' AND RecordID='<record.PrimaryKey.Values()>'` (canonical composite-key serialization, same
as tags), then `MJ: Files` by `FileID IN (…)`. Since each `MJ: Files` row carries its own `ProviderID`,
the unified cross-provider list is **one query, not a fan-out** — but `MJ: Files` has **no size column**
(unlike `ArtifactVersion`), so byte sizes would cost a `GetObjectMetadata` per file. Omit size in v1.

**Two ways to add, both first-class.** Contracts' *primary* flow is not upload: executed PDFs reach
SharePoint via PandaDoc → HubSpot, by a route MJ never sees. One mutation, two modes:

- **`RegisterRecordAttachment(entityId, recordId, accountId, providerKey, …)`** — attach **by
  reference**: create the `MJ: Files` row pointing at an object already in the provider, move no bytes,
  then link. Contracts flags this as *"a small piece of code we would write; MJ's own `CreateFile`
  mutation assumes the upload flow."*
- **Upload** — `CreatePreAuthUploadUrl` (account creds via Credential Engine) → client PUTs → the same
  mutation registers the result. Bytes never transit the API.

**Link role.** Add `Role NVARCHAR(100) NULL` (+ `Sequence INT NULL`) to `FileEntityRecordLink` so "the
executed document" is addressable without a named FK on every host table. That is what lets contracts
keep R-8; without it every app re-adds its own `…FileID` column and the panel can't label or order.

## Entity opt-in

`Entity.SupportsFileAttachments BIT NOT NULL DEFAULT 0`, then backfill the curated list — the exact
shape of the `AllowCaching` migration, extended property and `sp_refreshview` included. One column, no
`AutoUpdate…` twin (that exists only where CodeGen LLM-infers a value). **CodeGen will not stomp a
hand-set flag:** `createNewEntityInsertSQL()` (`CodeGenLib/.../manage-metadata.ts:6530`) is INSERT-only,
for brand-new entities, so adding `newEntityDefaults.SupportsFileAttachments` — plus an optional
`…BySchema` override copying `resolveAllowCachingForSchema()` — gives "on for new, off for existing" as
asked, and lets an app set its own default in `mj.config.cjs`. The flag reaches `EntityInfo`
automatically; apps flip entities via metadata sync.

## Preview: phase it, and buy nothing

`GET /media/:fileId?token=` serves **any** content type with the file's own MIME plus Range support —
the "media" name undersells it. So images, PDF (browser-native `<iframe>`), audio/video
(`MJStorageMediaPlayerComponent`) and text/markdown (`ng-markdown`) all preview with **zero new
dependencies**; everything else gets a type icon and an open. docx/xlsx/code/json come later by
generalizing `BaseArtifactViewerPluginComponent` off `MJArtifactVersionEntity` — its only coupling —
onto a content-source interface resolved by MIME through the same `ClassFactory` registry. And since
`ArtifactVersion.FileID` points at `MJ: Files`, the panel also covers documents filed by MJ
eSignature's `writeSignedArtifact` — contracts' phase-2 path.

## Phases

| # | Scope | Done when |
|---|---|---|
| 1 | Migration: **fix `UQ_FileEntityRecordLink`**, entity flag, link `Role`/`Sequence`, `File.FileStorageAccountID`; CodeGen default | A file can be linked to many records; an entity is attachment-capable |
| 2 | `ng-record-attachments` read-only panel registered at `entity: '*'` | Panel appears on every opted-in form with zero per-entity wiring; lists + opens |
| 3 | Toolbar paperclip + count badge (`base-forms`) | One-click access to the panel from the toolbar |
| 4 | `RegisterRecordAttachment` — by-reference first, then upload, delete, account picker | Contracts can point a record at a SharePoint object; users can upload |
| 5 | Inline preview — zero-dependency types, then the viewer registry | PDFs and images preview in-panel |

Each is independently shippable and its own PR. Phase 2 is useful alone — agent session recordings
already produce links. Contracts needs 1, 2 and 4; only 4 is on its critical path.

## Risks

0. **The link table's unique constraint forbids the feature.**
   `UQ_FileEntityRecordLink_EntityID_FileID UNIQUE ([EntityID], [FileID])`
   (`B202607091514__v5.46.x__Baseline.sql:3875`, added by
   `V202605221002__v5.37.x__Add_Unique_Constraints_To_MJ_Junction_Tables.sql:441`, never dropped)
   **omits `RecordID`** — so one file can be linked to exactly one record per entity, and the same
   executed PDF cannot be attached to two contracts. The lone existing writer never hit this because
   each recording is a fresh file. *Fix:* drop and re-add as `(EntityID, RecordID, FileID)` in phase 1.
   **Hard blocker; nothing works until this lands.**
1. **The permission model is wrong for this use case.** `CreateMediaAccessToken` gates on loading the
   `MJ: Files` row under the user's context — on *Files* permission, not the host record's readability.
   Someone who can read Files could read an attachment on an Account they can't see. *Fix:* gate the
   panel read and `RegisterRecordAttachment` on the host entity. **Blocks phase 2.**
2. **`MJ: Files` has `ProviderID` but no `AccountID`.** With two accounts on one provider,
   `ResolveStorageAccount()` picks "first active" and download can hit the wrong one — and contracts is
   explicitly a multi-account SharePoint story. *Fix:* additive column in phase 1.
3. **Attach-by-reference trusts a client-supplied `ProviderKey`** — a crafted key could register a
   `File` row pointing at any object in the account. *Fix:* validate via `ObjectExists` and confine to
   the account's `rootFolderID` before saving.
4. **A wildcard panel runs on every form in every MJ app.** Its self-hide path must be two synchronous
   checks with no query, or every form in the product pays. Same for bearer-token `/media` URLs, which
   mount before auth middleware and get no row-level re-check: short TTL, never logged.

## Decisions I need from you

1. **Permission semantics** (risk 1): gate on the *host record* (my recommendation) or on `MJ: Files`?
   Shapes the API — phase-2 blocking.
2. **Rail section, slide-out, or both?** The registry gives the rail section free and admin-tunable;
   the slide-out matches how you described it. I'd ship the rail first, paperclip in phase 3.
3. **`Role` on the link table** — worth a core schema change made largely for one app? I'd add it; the
   alternative is every app re-adding `…FileID` columns.
4. **The curated on-list** — my default: nothing in `__mj` beyond AI Agent Sessions, Conversations, Tasks.
5. **New-entity default.** You leaned on; I'd ship phase 1 *off* and flip it once the panel exists.

*Also flagged but not yet verified:* `MJ: Files` and the link entity may be seeded read-only for the
`UI` role, which would make the feature read-only for real users until an `EntityPermission` grant
ships. Confirm against a live DB before phase 4.
