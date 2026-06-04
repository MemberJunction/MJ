# Artifact Inline Preview — Pluggable Architecture (Proposal)

**Status:** proposal for review · **Reviewers:** AN-BC / Amith

> Architecture for the pluggable inline-preview extension. A working reference implementation
> exists on `fix/research-agent-report-display`; this doc is the design — the code will be
> refactored to match the decision below.

## Motivation

Now that conversation outputs are uniformly **artifact-based**, every artifact renders the
same way inline in a message: a generic rectangular info-bar (icon + name + type badge),
regardless of what it is. An image artifact should show the **image** inline; a video a
**player**; the full-size view still belongs in the right-side viewer panel.

We want this **pluggable per artifact type — not a hardcoded `if (type === 'Image')` switch in
the card** — so new media types (or downstream/custom types) get a preview by registering a
handler, exactly like the existing full-size viewer plugins.

## Decision (updated after review)

**Extend the existing `IArtifactViewerPlugin` with an optional preview slot — do NOT add a
second parallel plugin/registry.** (Per Amith: avoid yet another class; preview and viewer are
the same concept and share logic — `canHandle` and content resolution.) The one capability the
two-registry sketch had that's worth keeping — letting preview and viewer resolve to *different*
plugins, and preventing a viewer override from clobbering a base preview — is preserved by
**resolving each slot independently within the single registry** (see Resolution).

So: **one interface, two component slots, per-slot resolution.**

## Design

### Interface (additive, backward-compatible)

```ts
interface IArtifactViewerPlugin {
  canHandle(typeName: string, contentType?: string): boolean;   // shared by both roles

  componentType: Type<IArtifactViewerComponent>;                // full right-side viewer (existing, unchanged)
  previewComponentType?: Type<IArtifactPreviewComponent>;       // NEW — inline card preview, optional

  getMetadata?(version: MJArtifactVersionEntity): ArtifactMetadata;
}
```

- `componentType` (the viewer) stays **required and unchanged** → existing plugins
  (JSON/HTML/PDF/Code/Image/…) keep compiling and behave exactly as today.
- `previewComponentType` is **optional**. A plugin that omits it → the card shows today's
  default info-bar box for that artifact (no behavior change).
- The preview and viewer are **separate Angular components** (the preview is lightweight — no
  toolbar/feedback/tabs). They are *referenced from one plugin registration*, which is the whole
  point: one `canHandle`, one registration per type, no duplication.

### Resolution (per-slot, independent)

The viewer panel and the inline card consult the **same registry** but ask different questions:

```
Full viewer (right panel):
    highest-priority plugin whose canHandle(type, ct) === true            → render componentType

Inline preview (message card):
    highest-priority plugin whose canHandle(type, ct) === true
        AND has a previewComponentType                                    → render previewComponentType
    none → default info-bar box (unchanged)
```

Resolving the preview slot independently (rather than "the viewer winner also owns the preview")
buys two things the merged-but-naive version would lose:

- **Override safety.** A downstream/custom plugin that overrides the *viewer* for a type (wins on
  priority) but doesn't set `previewComponentType` will **not** suppress the base plugin's
  preview — the card falls through to the highest-priority plugin that *does* provide one. (MJ
  leans heavily on `@RegisterClass` overrides, so this matters.)
- **Divergent matching.** A broad viewer (e.g. "any text") can coexist with a specialized
  preview (e.g. markdown only) without one dictating the other.

### Shared logic = a service, not a base class

The genuinely shared part is **content resolution** (inline data URL vs. file-storage download
URL — image preview and image viewer load bytes identically) and MIME/type matching. That lives
in a **shared service/helper** used by both component kinds. The preview must **not** extend the
heavy `BaseArtifactViewerComponent` (toolbar/feedback/snapshot); it gets a thin
`BaseArtifactPreviewComponent` (`@Input() artifactVersion` + the shared content helper).

### Registration

Plugins register once, as today:

```ts
@RegisterClass(BaseArtifactViewerPlugin, 'ImageArtifactViewerPlugin')
export class ImageArtifactViewerPlugin implements IArtifactViewerPlugin {
  canHandle(type, ct?) { return ct?.startsWith('image/') === true || type === 'Image' || type === 'SVG Image'; }
  componentType = ImageArtifactViewer;          // full viewer (existing)
  previewComponentType = ImageArtifactPreview;  // NEW inline preview
}
```

Add a **registration-time check** that at least one of `componentType` / `previewComponentType`
is present (defends against a plugin that renders nothing). Today `componentType` is required so
this is automatically satisfied; the check guards future loosening.

## Extensibility

Giving a new type an inline preview is one optional field on its (existing or new) viewer plugin
plus a lightweight preview component — no card or resolver changes, no hardcoded type list.

## Files (reference implementation — will be refactored to the single-interface model)

```
packages/Angular/Generic/artifacts/src/lib/
  interfaces/artifact-viewer-plugin.interface.ts          (mod) add previewComponentType + IArtifactPreviewComponent
  components/base-artifact-preview.component.ts            (new) thin base for preview components
  services/…content-resolution                            (mod/new) shared by viewer + preview
  components/previews/image-artifact-preview.component.ts  (new)
  components/previews/video-artifact-preview.component.ts  (new)
  components/previews/audio-artifact-preview.component.ts  (new)
  components/plugins/image-artifact-viewer… etc.           (mod) set previewComponentType on existing plugins
  components/artifact-message-card.component.ts            (mod) resolve preview slot; else default box
  artifacts.module.ts, public-api.ts                       (mod)
```

> Note: the reference impl currently uses a *separate* `IArtifactPreviewPlugin` + its own
> resolver. The refactor collapses that into the single `IArtifactViewerPlugin` with per-slot
> resolution above. The preview *components* themselves are unaffected.

## Remaining open questions

1. ~~One plugin or two?~~ **Decided: one** (`IArtifactViewerPlugin` + optional preview slot, per-slot resolution).
2. **Preview affordances** — image `max-height` (~280px today), whether to lazy-load/thumbnail
   large media vs. stream full bytes inline, and the click target (whole card vs. explicit expand).
3. **Default fallback** — keep the current info-bar box as the universal default (proposed), or
   give text-y types at least a first-line text preview?

## Related (separate change)

Agents no longer create a *duplicate* standalone artifact for media already embedded inline in a
report (e.g. the research agent's base64 `<img>` infographic) — so the preview tier only ever
renders genuinely standalone media, not the report's inlined image.
