# MemberJunction Docs Site

The MemberJunction documentation site — an [Astro Starlight](https://starlight.astro.build) build that **weaves existing repo content into one site with zero manual sync**:

| Content | Source | How |
|---|---|---|
| Developer guides | `guides/*.md` | Auto-discovered by `scripts/ingest.mjs` |
| Package docs | `packages/**/README.md` (package roots + grouping dirs) | Auto-discovered; index table built from each `package.json` |
| Overview / Deployment / Upgrade / Contributing / Metadata | Root repo docs | Fixed list in `ingest.mjs` |
| Agent skills catalog | `.claude/skills/*/SKILL.md` | Auto-discovered frontmatter |
| Ecosystem cards | Skyway / Forge / VSCode / bizapps GitHub repos | Fetched at build time (fail-soft) |
| API reference (`/api/`) | TypeDoc over all packages | Built by `.github/workflows/docs.yml`, copied into `dist/api/` |

Adding a guide or a package README to the repo adds it to the site on the next deploy — **no docs-site change required**. The site never owns long-form content; if you're copy-pasting prose in here, stop and fix the ingest instead.

## How it works

`npm run build` = `ingest` + `astro build`:

1. **`scripts/ingest.mjs`** transforms repo markdown into `src/content/docs/` (generated paths are gitignored). Every relative link is rewritten on the MDAST (`scripts/lib/rewrite.mjs`): targets also rendered on the site become **relative** site links (so the deploy base can change freely); repo files not rendered become **GitHub blob/tree URLs pinned to the build's commit SHA**; relative images become pinned raw URLs. Unresolvable links are left as-is with a warning.
2. **Astro Starlight** renders the collection — nav, search (Pagefind), light/dark mode. ```mermaid fences become client-rendered diagrams (bundled mermaid, theme-aware).

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
