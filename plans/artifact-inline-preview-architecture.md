# Artifact Inline Preview — Pluggable Architecture (Proposal)

**Status:** proposal for review · **Author:** (draft) · **Reviewers:** AN-BC / Amith

> Quick architecture writeup for the pluggable inline-preview extension. A working
> implementation exists on `fix/research-agent-report-display` for reference, but this doc
> is the design — comment here and the code follows the feedback.

## Motivation

Now that conversation outputs are uniformly **artifact-based**, every artifact renders the
same way inline in a message: a generic rectangular info-bar (icon + name + type badge),
regardless of what it is. An image artifact should show the **image** inline; a video should
show a **player**; the full-size view still belongs in the right-side viewer panel.

We want this to be **pluggable per artifact type — not a hardcoded `if (type === 'Image')`
switch in the card** — so new media types (or downstream/custom types) get a preview by
registering a handler, exactly like the existing full-size viewer plugins.

## Reuse the existing viewer-plugin pattern

There is already a plugin system for the **full-size right-side viewer**, and the preview
tier deliberately mirrors it 1:1:

| Concern | Existing (full viewer) | New (inline preview) |
|---|---|---|
| Contract | `IArtifactViewerPlugin` | `IArtifactPreviewPlugin` |
| Base component | `BaseArtifactViewerComponent` | `BaseArtifactPreviewComponent` |
| Resolver | `ArtifactTypePluginViewerComponent` | `ArtifactTypePluginPreviewComponent` |
| Match | `canHandle(typeName, contentType)` | `CanHandle(typeName, contentType)` (static) |
| Registration | `@RegisterClass` → `MJGlobal.ClassFactory` | same |
| Surface | right-side panel | inline message card |

Two **independent registries**, same mechanism. A type can have a preview, a viewer, both,
or neither.

## Design

```
ArtifactMessageCard (per artifact in a message)
        │  (artifactTypeName, contentType)
        ▼
ArtifactTypePluginPreviewComponent  ── resolver
        │  enumerate ClassFactory registrations of BaseArtifactPreviewComponent
        │  first whose static CanHandle(typeName, contentType) === true wins
        ├─ match  ──► dynamically render that preview component (image/video/audio/…)
        └─ no match ──► emit (noPreviewAvailable) ──► card renders the default info-bar box
```

### Pieces

- **`IArtifactPreviewPlugin` / `BaseArtifactPreviewComponent`** — a *lightweight* contract:
  `@Input() artifactVersion`, a **static `CanHandle(typeName, contentType?)`**, and
  `componentType`. Intentionally no toolbar / feedback / tabs / snapshot machinery — those
  belong to the full viewer. Static `CanHandle` lets the resolver match **without
  instantiating** components (which carry Angular DI deps).

- **`ArtifactTypePluginPreviewComponent`** (resolver) — enumerates registered preview
  components via `MJGlobal.Instance.ClassFactory`, picks the first whose static `CanHandle`
  matches the artifact's `(typeName, contentType)`, and dynamically `createComponent`s it into
  a `ViewContainerRef`. Emits `noPreviewAvailable` when nothing matches.

- **Preview plugins** (initial set):
  - `ImageArtifactPreview` — inline `<img>`, `max-height` capped, `object-fit: contain`.
    `CanHandle`: `image/*` content-type or type name `Image` / `SVG Image`.
  - `VideoArtifactPreview` — `<video controls preload="metadata">`; stops click propagation so
    scrubbing doesn't open the full viewer. `CanHandle`: `video/*`.
  - `AudioArtifactPreview` — `<audio controls>`. `CanHandle`: `audio/*`.

- **`ArtifactMessageCard`** — consults the resolver up front (synchronous `CanHandle` check to
  avoid a flash / `ExpressionChanged`); if a preview matches it renders the preview card
  (media on top, compact meta footer), otherwise the **existing info-bar box, byte-for-byte
  unchanged**. Click-to-open-full-viewer and all current outputs (`actionPerformed`, …) are
  preserved on both variants.

### Content resolution

Preview components read the artifact bytes the **same way the matching full viewer already
does** (inline data URL vs. file-storage download URL) — no new content path. Reuses the
existing `ArtifactFileService` for file-backed artifacts.

## Extensibility

Adding a preview for a new type is self-contained — no card or resolver changes:

```ts
@RegisterClass(BaseArtifactPreviewComponent, 'MyTypePreviewPlugin')
@Component({ /* standalone:false, selector, template */ })
export class MyTypeArtifactPreview extends BaseArtifactPreviewComponent {
  static CanHandle(typeName: string, contentType?: string): boolean {
    return contentType?.startsWith('model/') === true; // e.g. 3D models
  }
}
```

Declare/export it, and it participates. No hardcoded type list lives in the card.

## Open questions (where I'd like feedback)

1. **One plugin or two?** Should preview + viewer be a *single* plugin exposing two component
   slots (`previewComponentType` + `viewerComponentType`) rather than two parallel registries?
   Trade-off: one registration per type & guaranteed consistency **vs.** clean separation
   (a type can want a preview but no special viewer, or vice-versa). Current proposal = two
   registries.
2. **Preview affordances** — max-height (currently ~280px for images), whether to lazy-load /
   thumbnail large media instead of streaming full bytes inline, and the click target
   (whole card vs. an explicit expand button).
3. **Default fallback** — keep the current info-bar box as the universal default (proposed), or
   give *every* type at least a richer default (e.g. first-line text preview for text-y types)?
4. **Where the doc/types should live** — colocate plugin authoring docs in
   `packages/Angular/Generic/artifacts` (alongside the viewer-plugin docs) once the contract is
   locked.

## Files (in the reference implementation)

```
packages/Angular/Generic/artifacts/src/lib/
  interfaces/artifact-preview-plugin.interface.ts        (new) contract
  components/base-artifact-preview.component.ts           (new) base + ComponentClass shape
  components/artifact-type-plugin-preview.component.ts    (new) resolver
  components/previews/image-artifact-preview.component.ts (new)
  components/previews/video-artifact-preview.component.ts (new)
  components/previews/audio-artifact-preview.component.ts (new)
  components/artifact-message-card.component.ts           (mod) preview-vs-box branch
  artifacts.module.ts, public-api.ts                      (mod) declare/export/register
```

(Related, separate change: agents no longer create a *duplicate* standalone artifact for media
that's already embedded inline in a report — so the preview tier only ever renders genuinely
standalone media, not the report's inlined infographic.)
