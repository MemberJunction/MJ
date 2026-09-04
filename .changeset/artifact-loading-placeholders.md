---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-artifacts": patch
---

Show that a generated artifact is still loading

A message with a generated image rendered as finished with nothing where the image belonged, then
the image appeared unannounced a few seconds later. It read as a failed generation rather than one
still in flight. Two windows had no visual state at all:

- `applyArtifactsToInstance` awaited each artifact and version row before rendering anything, even
  though `resolveDistinctArtifacts` had already returned them synchronously from an in-memory map.
  The artifacts that still need one are now published to the message immediately — name and
  visibility included, since `LazyArtifactInfo` carries both and only the ENTITY rows are lazy —
  and each draws a named `mj-loading` placeholder until its card is ready. `isLoaded` decides what
  counts as pending, so an artifact already in hand is never announced; the rest is filtered per
  artifact (by `UUIDsEqual`, since the two IDs come from different sources and differ in case
  between SQL Server and PostgreSQL), so a message showing a loaded report and still fetching an
  image renders both. Placeholders sort after the loaded cards, so an arrival appends rather than
  reorders. Applies to every artifact type.
- The image, audio and video previews each had only an `error` and a `loaded` branch, so they drew
  nothing while `resolveContentUrl()` resolved. All three now show `mj-loading`. The image holds it
  until the `<img>` `load` event fires rather than until `src` is assigned, because an inline
  `data:` URI — what MJ stores whenever no file storage account is configured — can be several MB
  and the decode is the part the user waits on; the pending image is hidden with `opacity` rather
  than `display: none`, which would take it out of the paint tree and stop the decode it is
  waiting for.

Three defects fixed alongside, all in the same code path: the artifact apply now runs after the
message's other inputs are assigned (it forces the child's first change-detection pass, so running
it early meant `ngAfterViewInit` saw a null agent run and never started the run-duration timer); a
per-message generation counter stops a stale in-flight load clobbering a newer one; and the
settle handlers no longer touch a destroyed view.

This does not change how long anything takes, and it does not address the separate delay before an
artifact exists server-side.
