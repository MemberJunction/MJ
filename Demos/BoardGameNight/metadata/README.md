# Board Game Night — declarative metadata

Records here are authored the way MJ's own agents are (see `metadata/agents/.sage-agent.json`):
`fields` + `@lookup:` references + a `uuidgen` primary key, pushed with `mj sync push`. No `sync`
block is hand-written — that is added by the build engineer's push at release time.

## agent-actions

Grants the Game Night Scorekeeper the two web actions it was missing.

**Why `Web Search` and not `Google Custom Search`.** The Scorekeeper was already granted
`Google Custom Search`, and that grant is Active — but the action fails before it ever reaches
Google:

```
Google Custom Search API key not found. Set google.customSearch.apiKey in mj.config.cjs
or GOOGLE_CUSTOM_SEARCH_API_KEY environment variable   (MISSING_API_KEY)
```

It needs BOTH a `GOOGLE_CUSTOM_SEARCH_API_KEY` and a `GOOGLE_CUSTOM_SEARCH_CX` (the Programmable
Search Engine ID); neither is set in this repo's `.env`, and `packages/MJAPI/.env` is a symlink to
that same file. Sage is granted the same action and is therefore equally unable to search on a
database without those credentials — copying Sage's grant list alone does not buy web access.

`Web Search` is DuckDuckGo-backed and takes **no credentials**, so it works as soon as it is
granted. `URL Metadata Extractor` rounds it out: search returns links, and this reads the title,
description and metadata off one without pulling the whole page.

`Google Custom Search` is deliberately left granted. It costs nothing while dormant and starts
working the moment the two environment variables are supplied — at which point the agent has both a
keyless and a keyed search path.

## Applying

```bash
mj sync push --dir Demos/BoardGameNight/metadata/agent-actions
```
