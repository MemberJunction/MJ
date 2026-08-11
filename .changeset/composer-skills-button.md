---
"@memberjunction/ng-composer": minor
"@memberjunction/ng-conversations": minor
---

Add a Skills button to the composer, beside Plan Mode.

`/` skill commands already worked, but were reachable only by knowing to type `/`. Nothing on
screen said the feature existed, so a user who had never been told about it had no way to find it.
The button is the visible door to the same trigger.

Clicking it calls the new `MentionEditorComponent.OpenTrigger('/')`, which opens the dropdown
WITHOUT writing anything into the editor. The trigger character only ever exists as the chip the
user picks, so dismissing leaves the message exactly as they left it. With no character to anchor
on, the editor captures a baseline length when a trigger opens this way, and three paths consult
it: typing filters against the baseline rather than searching for the character, chip insertion
removes only what was typed, and dismissal has nothing to undo.

It also toggles: a second click closes, because a button carrying `aria-pressed` has to be able to
un-press. Without that the second click re-ran the open path, re-emitting the event pair and
re-capturing the baseline at the new caret.

Built as a sibling of the existing strip controls, with the same `attach-button-icon` chrome and
the same active treatment as Plan Mode. The ARIA deliberately differs: Plan Mode is a toggle button
(a mode that stays on) so `aria-pressed` is correct there, while this opens a popup and therefore
uses `aria-expanded` + `aria-haspopup`. Announcing "pressed" for revealing a list is the wrong
thing for a screen reader to say. It joins the strip's
visibility gate so a composer offering skills but no attachments, voice or plan mode still renders
the strip.

**Before/After pair, per `guides/UI_LAYERING_GUIDE.md` section 6.** Opening skills is an action a
host might veto, so it ships as `beforeSkillsOpened` (carrying `BeforeSkillsOpenedEventArgs` with
`Cancel` / `CancelReason`) and `afterSkillsOpened`. `After` is not emitted on the canceled path, and
not emitted when no active provider owns the trigger, so a host counting it counts dropdowns the
user saw rather than clicks. The cancelable base is declared in `ng-composer` rather than imported
from `ng-conversations` because the dependency runs the other way. `Before` handlers must be
synchronous: EventEmitter's synchronous dispatch is how `Cancel` travels back.

**The pressed state is derived, not an input.** Plan Mode's active state is a persisted user
preference the host owns and threads down. "Is the skill dropdown open" is intrinsic to the
composer, so it reads `MentionEditorComponent.IsTriggerOpen('/')` instead. An `@Input` there would
be an API no host could answer, and would leave the button permanently unpressed if nobody bound it.

No new host-level cap: the button is gated on the existing `EnableSkillCommands` /
`enableSkillCommands` / `allowSkillCommands` chain, which already defaults true at every layer. The
button and the keystroke are two doors to one feature, so one flag governs both rather than letting
a composer advertise skills it will not serve.

**Two pre-existing dropdown bugs fixed along the way**, both of which affect every trigger
(`@`, `#`, `/`) rather than only the new button:

* **Click-away never dismissed.** Dismissal relied entirely on the editor's blur, and clicking a
  non-focusable area does not blur a contenteditable, so the dropdown stayed open with nothing able
  to close it. A `document:mousedown` listener now closes it, chosen over `click` because mousedown
  fires before focus moves and therefore cannot race blur's 200ms timer. Clicks inside the
  component are exempt, so a suggestion row still selects.
* **The dropdown could land off screen.** Positioning measures the caret, and a collapsed range in
  an empty editor measures 0x0 at 0,0 in every browser, pinning the menu to the bottom-left corner
  of the viewport. It now falls back to the editor's own box. The menu also prefers to open ABOVE
  the composer: the composer sits at the bottom of the chat, so a downward menu covers the text
  being typed.

`OpenTrigger` and `IsTriggerOpen` are public and generic. Any trigger character with an active
provider can now be opened from a control, and any control can reflect whether its trigger is open.

Minor rather than patch because the public API grows: `OpenTrigger` and `IsTriggerOpen` on
`MentionEditorComponent`; `enableSkills`, `beforeSkillsOpened` and `afterSkillsOpened` on
`MessageInputBoxComponent` and `mj-ai-composer`; and `CancellableComposerEventArgs` /
`BeforeSkillsOpenedEventArgs` newly exported from `@memberjunction/ng-composer`. Existing consumers
see no change: `enableSkills` defaults false at the leaf, and the chain above only turns it on where
skill commands were already enabled.
