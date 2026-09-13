# Release Notes

One markdown file per release, named `v<major>.<minor>.<patch>.md` (e.g. `v5.51.0.md`).

These files are the **canonical release notes**. The docs site renders every file in this
directory automatically at [docs.memberjunction.org/releases/](https://docs.memberjunction.org/releases/),
newest first, with an auto-generated index — no site changes needed.

## The format is defined here, and only here

Three generators write release prose. All three read **this file** for the format instead
of carrying their own copy:

| Generator | Writes | Runs |
|---|---|---|
| `/notes` (`.claude/commands/notes.md`) | `releases/v<version>.md` for an Edge release | by hand, at DEPLOYMENT.md Step 11 |
| `generate-release-notes.yml` — Edge job | the release **PR body** | in CI, when the PR into `main` opens |
| `generate-release-notes.yml` — line job | `releases/v<version>.md` for an LTS line patch | in CI, after the line release publishes |

Each of them used to restate the template inline, and the four copies had already drifted
apart — three of them still described a format no release had used since v5.51.1. Change
the format **here**; the prompts do not need editing.

## Template

```markdown
# <6-10 word summary of the release>

## TL;DR
<1-3 sentences. Headline features first, then fixes and improvements as one short clause.>

**Upgrade Notes apply:** <one clause — only when that section exists below.>

<standing context for the release line, if it has any — e.g. "Edge builds are prereleases.">

## New Features
- ...

## Improvements
- ...

## Bug Fixes
- ...

## Upgrade Notes
- ...
```

Omit any section with no content — a patch release usually has only `## Bug Fixes`.
`## Upgrade Notes` appears **only** when a deployment could have depended on the old
behaviour; most patches need none, and inventing one is worse than omitting it.

## Writing the TL;DR

`## TL;DR` is required and comes first. It exists because the release PR body is pasted
into Teams verbatim, and most readers there stop after it.

Its job is to let someone **decide whether to read further** — not to tell them what
happened. The sections below already explain. A TL;DR that also explains is the document
again at higher altitude, which is exactly no use to the reader who wanted to skip the
document. Name things; let the sections describe them.

- **One to three sentences of prose, not bullets.** Anything that does not fit belongs in
  a section. Bullets invite one-per-change, which is how this section grows into a second
  copy of the release.
- **User-facing features that create business value come first.** Name them and move on.
  Fixes and improvements follow in one short clause, summarised as a group rather than
  enumerated.
- **Name, do not explain.** "Field-Level Security" is a complete entry. The defect, the
  mechanism, the packages and the consequence all belong in the section bullets — the
  "lead with the consequence" rule below applies THERE, not here. It is the single easiest
  way to turn this section back into an essay.
- **It is the only summary prose in the file.** Do not also write an unlabelled intro
  paragraph — the TL;DR replaces it. The H1 is the one-line version, the TL;DR is the
  thirty-second version, the sections are the full record. Three stacked summaries is the
  failure mode this section exists to prevent.
- **Do not pad the TL;DR to avoid repeating the H1.** The H1 is consumed on its own — it is
  the page title and the whole of a release's line in the index — so it names the headline
  features by design, and the TL;DR naming them again is correct. What the TL;DR must add is
  what the H1 cannot carry: the features below the headline, the one-clause fixes summary,
  and the upgrade flag. A TL;DR that is only the H1 restated has done nothing.
- **Flag `## Upgrade Notes` on its own line after the prose**, when that section exists:
  "**Upgrade Notes apply:** external GraphQL consumers must regenerate their types." A
  breaking change is the highest-value thing a scanning reader can hit, so it gets a flag
  rather than a slot in the feature list — but one clause only. The detail stays in the
  section.
- **No marketing language.** No "we are excited to", no "a significant step forward". This
  is a technical record for people who run the software.

A worked TL;DR, for a release whose sections run to 40 bullets:

> Field-Level Security, end-to-end support for OpenAI's Live realtime stack, and a
> first-class AI Persona catalog. Fixes for Explorer search returning no results on
> ordinary terms, plus CodeGen and realtime driver improvements.
>
> **Upgrade Notes apply:** the generated GraphQL schema drops non-nullability on ~2,150
> fields, so externally generated types need regenerating.

## House style for section bullets

- Each bullet opens with a **bolded claim**, then the affected packages in parentheses as
  backticked names, then the explanation.
- Explain the defect and its user-visible consequence, not the code change.
- Every claim must trace to the changesets, the commits, or the repo. Invent nothing — if
  the material does not say *why* something changed, describe what changed and stop.
- Do not mention npm dist-tags, CI, or the release process itself. Readers are users of the
  packages, not of this repo.

`releases/v5.51.1.md` is the worked example for section-bullet depth and tone. Take only
the bullets from it: its top-of-file structure predates the TL;DR requirement, so follow
the template above rather than that file's opening.

## Publishing

The H1 summary becomes part of the page title on the site (`v5.51.0: <summary>`), and the
TL;DR becomes the page's search/SEO description (`docs-site/scripts/lib/markdown.mjs`).
Commit the file as part of the release; the site deploy that follows the npm publish picks
it up. This README itself is not rendered.
