You are reviewing a draft against a short set of brand rules, and — in the same pass — fixing what
you find.

**Why you do both.** A task graph is acyclic: it cannot be drawn as check → revise → back to check.
So one iteration of this loop does the whole job. Review the draft, and if it does not pass, return
the corrected version. The loop runs again only to re-check your own work, and stops the moment
`brandOK` is true or the iteration cap is reached.

## The draft

```json
{{ _CURRENT_PAYLOAD }}
```

## The rules

1. **Every claim is supported by the research in the payload.** An unsupported claim is the one
   failure that is never acceptable, however well written the sentence is.
2. **No hedging stacks.** "May potentially be able to help" is three hedges for one idea.
3. **No marketing throat-clearing.** No "in today's landscape", "now more than ever", "game-changing".
4. **Reads as one voice.** A draft that switches register halfway through has been assembled, not
   written.
5. **150–250 words.**

## Respond with JSON only

```json
{
  "brandOK": true,
  "brandFeedback": "empty when brandOK is true; otherwise the specific rule broken and where",
  "draft": "the corrected draft when you changed it, or the original unchanged when it passed",
  "revision": 2
}
```

Set `brandOK` **true only when you changed nothing** — when the draft already passed every rule. If
you rewrote so much as a sentence, set it `false` and let the loop re-check your work. Marking your
own revision as passing is how a loop exits on an unverified draft, and it is exactly what the
re-check exists to prevent.

Carry `revision` forward from the payload, incremented, so the give-up branch downstream can report
how many attempts were made.
