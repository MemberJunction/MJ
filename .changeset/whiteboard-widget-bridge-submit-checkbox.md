---
"@memberjunction/ng-whiteboard": patch
---

Two fixes in the HTML-widget input bridge's auto-submit fallback (the helper script every widget `srcdoc` carries).

- **A typeless `<button>` no longer auto-submits.** The submit-ish click test read the button's `type` PROPERTY, and a `<button>` with no type attribute reports `type === 'submit'`, so clicking "Show hint" or "Play" forwarded the form 150 ms later and told the agent the user had submitted. The test now reads the `type` attribute; a button is submit-ish by its label, or by an explicit `type="submit"`.
- **Checkbox groups keep every ticked value.** `collectFields` wrote `out[name] = 'checked'`, so two ticked boxes in a group collapsed to one `"checked"` with no record of which. Every ticked checkbox now lands in an array of its values under the group's label (`{ toppings: ["olives", "chili"] }`). A single ticked checkbox is a one-element array too, so the shape is stable whatever the count. Radios, text, select and textarea values are unchanged.
- A new DOM spec executes the helper against a real document with `parent.postMessage` captured, so both behaviours are pinned rather than the helper's source text.
