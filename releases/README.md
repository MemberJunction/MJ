# Release Notes

One markdown file per release, named `v<major>.<minor>.<patch>.md` (e.g. `v5.51.0.md`).

These files are the **canonical release notes**. The docs site renders every file in this
directory automatically at [docs.memberjunction.org/releases/](https://docs.memberjunction.org/releases/),
newest first, with an auto-generated index — no site changes needed. Posting the same
content to Teams is optional; this directory is the record.

## Authoring

The `/notes` skill (`.claude/commands/notes.md`) generates a release's notes from the
diff, commit messages, and `.changeset/` entries, and writes the file here. Format:

```markdown
# <6-10 word summary of the release>

## New Features
- ...

## Improvements
- ...

## Bug Fixes
- ...
```

The H1 summary becomes part of the page title on the site (`v5.51.0: <summary>`).
Commit the file as part of the release; the site deploy that follows the npm publish
picks it up. This README itself is not rendered.
