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

It also toggles: a second click closes, because a disclosure control has to be able to close what
it opened. Without that the second click re-ran the open path, re-emitting the event pair and
re-capturing the baseline at the new caret.

Built as a sibling of the existing strip controls, with the same `attach-button-icon` chrome and
the same active treatment as Plan Mode. The ARIA deliberately differs: Plan Mode is a toggle button
(a mode that stays on) so `aria-pressed` is correct there, while this opens a popup and therefore
uses `aria-expanded` + `aria-haspopup`. Announcing "pressed" for revealing a list is the wrong
thing for a screen reader to say. It joins the strip's
visibility gate so a composer offering skills but no attachments, voice or plan mode still renders
the strip.

**Before/After pair, per `guides/UI_LAYERING_GUIDE.md` section 6.** Opening skills is an action a
host might veto, so it ships as `BeforeSkillsOpened` (carrying `BeforeSkillsOpenedEventArgs` with
`Cancel` / `CancelReason`) and `AfterSkillsOpened`. `After` is not emitted on the canceled path, and
not emitted when no active provider owns the trigger, so a host counting it counts dropdowns the
user saw rather than clicks. `Before` handlers must be synchronous: EventEmitter's synchronous
dispatch is how `Cancel` travels back.

The base, `CancellableComposerEventArgs`, is per-domain rather than shared. That matches the same
guide's naming table, which specifies `Cancellable<Domain>EventArgs` for exactly this class, and the
sixteen packages already following it. It is also the only option here on dependency grounds:
`ng-composer` is the generic layer and cannot import from `ng-conversations`.

**The expanded state is derived, not an input.** Plan Mode's active state is a persisted user
preference the host owns and threads down. "Is the skill dropdown open" is intrinsic to the
composer, so it reads `MentionEditorComponent.IsTriggerOpen('/')` instead. An `@Input` there would
be an API no host could answer, and would leave the button permanently collapsed if nobody bound it.

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
  component are exempt, so a suggestion row still selects. The Skills button sits OUTSIDE the
  editor's host, so it needs the same exemption: without it the button's mousedown read as an
  outside press and closed the dropdown, then the click saw it already closed and reopened it, so
  the toggle never appeared to work. That seam is covered by a DOM test that fires real bubbling
  mousedown/click rather than calling the handler, which is what hid the bug.
* **The dropdown could land off screen.** Positioning measures the caret, and a collapsed range in
  an empty editor measures 0x0 at 0,0 in every browser, pinning the menu to the bottom-left corner
  of the viewport. It now falls back to the editor's own box. The menu also prefers to open ABOVE
  the composer: the composer sits at the bottom of the chat, so a downward menu covers the text
  being typed.
* **A button-opened menu anchors to the button, not the caret.** On the typed path the user's eyes
  and query are both at the caret, so the caret is the right anchor. On the button path nobody is
  looking at the caret. The anchored menu aligns left and grows rightward, flipping to right-aligned
  only when that would overflow the viewport — and the flip aligns to the COMPOSER's right edge
  rather than the button's, because the strip is pinned bottom-right and Skills is the leftmost of
  five icons, so pinning to that one icon hangs the menu's whole width out to its left. Coordinates
  are viewport-relative throughout, since the dropdown renders with `useFixedPositioning`.

`OpenTrigger` and `IsTriggerOpen` are public and generic. Any trigger character with an active
provider can now be opened from a control, and any control can reflect whether its trigger is open.

**BREAKING (renames), and the reason this is `minor` rather than `patch`.** `MessageInputBoxComponent`
was violating MJ's convention that public class members are `PascalCase`, so every public input,
output, getter and method on it is renamed: `placeholder` to `Placeholder`, `disabled` to `Disabled`,
`value` to `Value`, `valueChange` to `ValueChange`, `textSubmitted` to `TextSubmitted`,
`planModeToggle` to `PlanModeToggle`, `canSend` to `CanSend`, `onSendClick` to `OnSendClick`, and so
on for all of them. `TriggerProviders`, `ExcludedTriggerKeys` and `Provider` were already correct.

Native DOM bindings and framework members are deliberately untouched: `[disabled]` on a `<button>`
is a DOM property, `ngOnInit` / `writeValue` / `registerOnChange` are framework contracts, and
`mj-mention-editor`'s own inputs keep their current casing because that component is not renamed
here.

`mj-ai-composer` is updated to the new names. Any other consumer binding these inputs or listening
to these outputs must rename accordingly.
