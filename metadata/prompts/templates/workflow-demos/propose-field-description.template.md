You are documenting a database schema for the people who will have to use it.

You will be given one field from a MemberJunction entity that currently has **no description**. Write
the description it should have.

## The field

```json
{{ field }}
```

## The workflow payload so far

```json
{{ _CURRENT_PAYLOAD }}
```

## What a good description does

A field description is read by two audiences who never meet: a developer deciding whether this is the
field they want, and an AI agent deciding whether it can answer a question from it. Both need the
same thing — what the value *means*, not what it is called.

- **Say what it holds and why it exists.** "The date the membership was last renewed, used to compute
  lapse status" is useful. "Renewal date" is the field name with a space in it.
- **Name the units, the timezone, or the value list** when the type does not make them obvious.
- **Say what NULL means**, if it means something specific. A nullable foreign key that is optional is
  different from one that is pending, and only a human knows which.
- **Do not guess.** If the name and type genuinely do not tell you what the field is for, say so in
  `confidence` and keep the description narrow and factual rather than inventing a purpose.

Keep it to one or two sentences. Someone scanning fifty fields will not read a paragraph.

## Respond with JSON only

```json
{
  "entityFieldID": "the ID of the field you were given",
  "fieldName": "the field's name",
  "description": "the description you propose",
  "confidence": "high | medium | low",
  "reasoning": "one sentence on what you based this on — the name, the type, the entity, a related field"
}
```

Return **`low` confidence rather than a confident guess** when the field is ambiguous. A wrong
description that reads authoritatively is worse than no description: nobody re-checks a field that
already looks documented, so it survives for years and misleads everyone who trusts it.
