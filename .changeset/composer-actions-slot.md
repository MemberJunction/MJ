---
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-composer": minor
---

Add a `composerActions` chat slot so hosts can put their own controls in the composer's action
strip, beside Plan Mode.

The strip was closed. `mj-message-input-box` takes booleans (`enablePlanMode`, `enableAttachments`,
`enableRealtime`) and emits events, and there is no `ng-content` anywhere in the
`mj-conversation-chat-area` → `mj-message-input` → `mj-ai-composer` → `mj-message-input-box` chain —
so a host wanting one more button next to Plan Mode had two options, both bad: park the control
somewhere else in the page, or style-pierce into MJ's internals and break on the next release.

`composerActions` mirrors the existing `headerActions` slot exactly: additive, rendered after the
stock controls so they keep fixed positions, and projected as a template the host owns.

```html
<mj-conversation-chat-area ...>
  <ng-template mjChatSlot="composerActions" let-disabled>
    <button class="attach-button-icon" [disabled]="disabled" (click)="OpenSkills()">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
    </button>
  </ng-template>
</mj-conversation-chat-area>
```

Two details worth knowing: the strip renders whenever the slot is filled, even with every stock
control disabled (otherwise a host projecting into an otherwise-empty strip would get nothing), and
the template context carries the composer's `disabled` state so a projected button can follow it
without the host tracking composer state itself.

Paired with `allowComposerActions` on the chat area (defaults `true`), matching the existing
`allowPlanMode` / `allowAttachments` / `allowRealtime` caps so an embedded or read-only surface can
switch projected actions off centrally.

No `Before*`/`After*` pair here on purpose: the projected content is host-owned, so the host's own
control emits its own events — MJ cannot meaningfully gate a click it does not own. The cancelable
contract stays where there is an MJ action to cancel.

Minor rather than patch because the change is additive to the public API: `composerActions` joins
the `MJChatSlotName` union, `IMJChatComposerActionsContext` is newly exported from
`@memberjunction/ng-conversations`, `mj-conversation-chat-area` gains `allowComposerActions`, and
`mj-message-input-box` gains `actionsTemplate`.

One compatibility note: **the two packages must move together.** `ng-conversations` binds
`[actionsTemplate]` on `mj-message-input-box`, which only exists from this version of
`ng-composer` — a newer `ng-conversations` against an older `ng-composer` fails template
compilation on an unknown property rather than degrading quietly. The shared minor bump keeps them
aligned; a consumer pinning the two independently should bump both.

Additive and opt-in — no behaviour change for any existing consumer.
