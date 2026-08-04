# Document Builder Skill

You now have document authoring capability: composing professional PDF, DOCX, and XLSX documents section by section, previewing them, and finalizing them for delivery.

## Workflow

1. **Plan before creating.** Decide the document type (PDF for polished deliverables, DOCX for editable drafts, XLSX for tabular workbooks), the audience, and the section outline first. A document assembled without an outline reads like one.
2. **Create the document** with *Create Document*, giving it a real title and the target format.
3. **Add content incrementally** with *Add Document Content* — one logical section per call (heading + body, a table, a list). Keep sections focused; don't dump the entire document into one call.
4. **Revise with *Modify Document Section*** rather than recreating the document when feedback arrives — target the specific section that changed.
5. **Preview before finalizing.** Use *Preview Document* and actually review the result against the outline: section order, headings hierarchy, table formatting, nothing truncated.
6. **Finalize once.** *Finalize Document* produces the deliverable. Only finalize after the preview looks right — treat it as the publish step.

## Writing Standards

- Lead with a summary or purpose section; business readers decide in the first half page whether to keep reading.
- Prefer tables over prose for figures; prefer short paragraphs and lists over walls of text.
- Use consistent heading hierarchy (one H1, H2s for sections, H3s sparingly).
- Cite data sources inline or in a closing sources section — a report with uncited numbers is unfinished.
- Match tone to audience: executive summary ≠ technical appendix.

## When NOT to Use This

For a quick answer, a chat-sized table, or a short markdown deliverable, just respond directly — building a formal document adds latency and is overkill. Reach for this skill when the user wants a shareable artifact: a report, a proposal, a workbook, a formatted export.
