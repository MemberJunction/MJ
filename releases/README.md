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
- <consequence-first, one sentence>
- <consequence-first, one sentence>
- <consequence-first, one sentence>

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

- **Three to five bullets, one sentence each.** If a point needs two sentences, it belongs
  in a section below.
- **Lead with the consequence, not the change.** "Scheduled jobs silently stopped honouring
  their activation windows" beats "changed a comparison in `isJobDue`."
- **It is the only summary prose in the file.** Do not also write an unlabelled intro
  paragraph — the TL;DR replaces it. The H1 is the one-line version, the TL;DR is the
  thirty-second version, the sections are the full record. Three stacked summaries is the
  failure mode this section exists to prevent.
- **Point at `## Upgrade Notes`, never restate them.** When that section exists, say so in
  one clause as the last bullet — "**Upgrade Notes apply** — two auth settings change
  behaviour" — and leave the detail in the section.
- **No marketing language.** No "we are excited to", no "a significant step forward". This
  is a technical record for people who run the software.

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
