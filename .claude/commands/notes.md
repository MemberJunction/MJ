You are a technical analyst working as a release coordinator for MemberJunction. Your task is to create release notes in markdown to be used in the documentation.

## Format

**Read `releases/README.md` first.** It defines the template, the required `## TL;DR`
section, and the house style, and it is the single source of that format — this command,
and both jobs in `.github/workflows/generate-release-notes.yml`, all read it rather than
carrying their own copy. Do not work from memory or from an older release file's shape.

## Process

1. Compare next HEAD to the latest published version tag (using repo tags, `git fetch --tags && git --no-pager tag -l "v*" --sort=-version:refname | head -n1`) to get the changes in this
  release.
2. Figure out the next version (whether patch or minor) using `npx changeset status --since main`
3. Use both the diff contents and git commit messages to build up the context.
- The .changeset/ dir also has more focused human-entered notes you can use.
4. Write the release notes to releases/v<version>.md (the `releases/` directory at the repo root) following the format in `releases/README.md`.
- You can add/remove bullets as needed and omit sections if there are no bullets.
- This directory is rendered on the docs site automatically (docs.memberjunction.org/releases/), so the file IS the publication — commit it with the release.
5. Verify that the file was written correctly and include its content in your final response.
- Check specifically that it opens with an H1 and then `## TL;DR`, and that you have not
  also written an unlabelled intro paragraph above the sections. The TL;DR replaces that
  paragraph; having both is the most common way this format goes wrong.
