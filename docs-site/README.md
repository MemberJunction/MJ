# MemberJunction Docs Site

The MemberJunction documentation site — an [Astro Starlight](https://starlight.astro.build) build that **weaves existing repo content into one site with zero manual sync**:

| Content | Source | How |
|---|---|---|
| Developer guides | `guides/*.md` | Auto-discovered by `scripts/ingest.mjs` |
| Package docs | `packages/**/README.md` (package roots + grouping dirs) | Auto-discovered; index table built from each `package.json` |
| Overview / Deployment / Upgrade / Contributing / Metadata | Root repo docs | Fixed list in `ingest.mjs` |
| Release notes | `releases/v*.md` (written by the `/notes` skill) | Auto-discovered; newest-first index generated |
| Agent skills catalog | `.claude/skills/*/SKILL.md` | Auto-discovered frontmatter |
| Ecosystem cards | Skyway / Forge / VSCode GitHub repos | Fetched at build time (fail-soft) |
| BizApps catalog (`/guides/bizapps/`) | Every public `bizapps-*` repo in the org, read from its `mj-app.json` | Fetched at build time by `scripts/lib/bizapps-source.mjs`; falls back to the committed `guides/BIZAPPS_GUIDE.md` when GitHub is unreachable. See [BizApps catalog](#bizapps-catalog) |
| API reference (`/api/`) | TypeDoc over all packages | Built by `.github/workflows/docs.yml`, copied into `dist/api/` |

Adding a guide or a package README to the repo adds it to the site on the next deploy — **no docs-site change required**. The site never owns long-form content; if you're copy-pasting prose in here, stop and fix the ingest instead.

## How it works

`npm run build` = `ingest` + `astro build`:

1. **`scripts/ingest.mjs`** transforms repo markdown into `src/content/docs/` (generated paths are gitignored). Every relative link is rewritten on the MDAST (`scripts/lib/rewrite.mjs`): targets also rendered on the site become **relative** site links (so the deploy base can change freely); repo files not rendered become **GitHub blob/tree URLs pinned to the build's commit SHA**; relative images become pinned raw URLs. Unresolvable links are left as-is with a warning.
2. **Astro Starlight** renders the collection — nav, search (Pagefind), light/dark mode. ```mermaid fences become client-rendered diagrams (bundled mermaid, theme-aware).

## BizApps catalog

`/guides/bizapps/` is built from GitHub, not from repo markdown. On every build, ingest lists the public, non-archived `bizapps-*` repositories in the MemberJunction org, reads each one's `mj-app.json` (from `main`, the release branch, else the default branch), and writes `guides/bizapps.mdx` with the catalog embedded for `src/components/BizAppsCatalog.astro`: a dependency map laid out at build time (`src/lib/bizapps-layout.mjs`), one card per app, and the hand-picked "Also in the org" section. Each app's Font Awesome `icon` is turned into inline SVG (`scripts/lib/fa-icons.mjs`) and its `color` tints its tile.

| Module | Does |
|---|---|
| `scripts/lib/bizapps-source.mjs` | All network access: discovery (throws on failure) and per-repo reads (fail-soft) |
| `scripts/lib/bizapps-catalog.mjs` | The pure model, plus the only hand-maintained parts: `FEATURED_REPOS` (More Cheese, Loom, Forge) and `STORIES` |
| `scripts/lib/bizapps-markdown.mjs` | The GitHub copy, `guides/BIZAPPS_GUIDE.md` |
| `scripts/bizapps-guide.mjs` | CLI that regenerates that copy; `--check`, `--source <file>`, `--save-source <file>` |

A new BizApp needs no change here: a public `bizapps-<name>` repo with an `mj-app.json` appears on the next build. When GitHub cannot be read, ingest renders the committed `guides/BIZAPPS_GUIDE.md` instead, and documentation sets older than MJ 6 get no BizApps page. The committed copy is refreshed by `.github/workflows/bizapps-guide.yml` after each docs deploy and weekly, through a pull request.

Offline preview: `BIZAPPS_SOURCE_FILE=<file> npm run dev` renders from a source saved earlier with `node scripts/bizapps-guide.mjs --save-source <file>`.

## Local development

This folder is deliberately **outside the npm workspaces** — install here, not at the repo root:

```bash
cd docs-site
npm install
npm run dev        # ingest + dev server at localhost:4321
npm run build      # ingest + full static build into dist/
npm test           # unit tests for the link rewriter + slug math
```

`/api/` (TypeDoc) is only assembled in CI; locally that link 404s — expected.

## Deployment

`.github/workflows/docs.yml` builds the monorepo, runs TypeDoc, builds this site with `DOCS_BASE=/MJ`, copies TypeDoc into `dist/api/`, and deploys to GitHub Pages. `.github/workflows/docs-site-ci.yml` builds the site (tests + ingest + astro, no TypeDoc) on PRs that touch docs content.

When the `docs.memberjunction.org` CNAME flips to GitHub Pages, change `DOCS_BASE`/`DOCS_SITE` in `docs.yml` and add a CNAME file — content needs no changes (all internal links are relative).

Plan and decision history: [`plans/mj-documentation/plan.md`](../plans/mj-documentation/plan.md).
