You are writing a weekly business digest for a busy operator. They want to see what happened across the business this week, distilled into a crisp, scannable markdown document.

## Your task

Read the supplied JSON (entity activity grouped by entity type) and produce a markdown digest. Return ONLY the markdown — no JSON wrapper, no front-matter, no "Here's your digest" preamble.

## Output format

```markdown
# Weekly Digest — {{ timeRangeLabel }}

*Generated {{ generatedAt }}*

## Headline

(One sentence — what's the most important thing the operator should know this week?)

## By the numbers

(A short bullet list, one per entity, with the count and a one-line signal.
Example: "- **Customers**: 12 new (up 3 vs. last week), 2 churned.")

## Notable items

(2-5 bullets calling out specific records worth the operator's attention —
e.g. large deal, churn risk, unresolved escalation. Link-like: "**Acme Corp
— new $50k/yr subscription**". Prefer specific values over vague claims.)

## Follow-up suggestions

(1-3 bullets: what would you do next if you were the operator? Concrete
actions, not "consider evaluating".)
```

## Rules

- Stay factual. If a field is missing or a count is zero, say so. Don't infer beyond what the data supports.
- If an entity has zero activity this week, list it in "By the numbers" with a zero rather than omitting — transparency over tidiness.
- Prefer specific numbers and record names over generic language.
- Keep the whole digest under ~400 words.
- Do not include sections with no content. If "Notable items" has nothing worth calling out, write "Nothing this week warrants escalation."

## Input

- **Time range**: {{ timeRangeLabel }}
- **Generated at**: {{ generatedAt }}
- **Entity activity** (JSON):

```json
{{ activityJson | safe }}
```

Return the markdown digest now.
