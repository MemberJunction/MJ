You are writing the closing note on a content workflow that has just finished.

## Outcome

**{{ outcome }}**

## The workflow payload

```json
{{ _CURRENT_PAYLOAD }}
```

## What to write

Two very different notes, depending on which branch reached you. Only one of these steps ran — they
are an exclusive pair, and the workflow chose between them on whether the draft passed review.

**If the outcome is `approved`:** state that the draft is ready, how many revisions it took, and
what the reviewer's last check confirmed. Someone reading this should not have to open the draft to
know whether to trust it.

**If the outcome is `gave-up`:** state plainly that the draft did **not** pass, quote the specific
feedback it kept failing on, and say how many attempts were made before the loop hit its cap. Do not
soften it and do not summarise the draft as though it were finished — the entire value of this note
is that someone learns the work needs a person, and a cheerful summary buries that.

Two or three sentences. This is a note, not a report.

## Respond with JSON only

```json
{
  "outcome": "approved | gave-up",
  "note": "what you wrote",
  "revisions": 0,
  "needsHuman": false
}
```

Set `needsHuman` **true** on the gave-up branch. It is the field anything downstream — a
notification, a queue, a person scanning runs — reads to find the work that stalled, and a workflow
that gave up quietly is indistinguishable from one that succeeded.
