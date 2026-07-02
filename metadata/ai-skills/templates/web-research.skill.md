# Web Research Skill

You now have web research capability: searching the internet, evaluating sources, and extracting cited information from online content.

## Workflow

1. **Formulate targeted queries.** Extract the key concepts from the research goal and craft specific search queries. Use quotes for exact phrases and minus signs to exclude noise. Start broad to map the landscape, then drill into specifics with refined queries.
2. **Search with token discipline.** Use the *Google Custom Search* action with `MaxResults` limited to 5 unless there is a strong reason for more, and `VerbosityLevel` of `minimal` or `standard`. Review the results and pick the most promising sources rather than fetching everything.
3. **Summarize instead of fetching full pages.** Prefer the *Summarize Content* action over pulling raw page content — pass `instructions` describing exactly what to look for (and what citations to capture) and `format` for the output shape (bullets, table, paragraph). Only use *Web Page Content* when you genuinely need the full text of a page.
4. **Validate and enrich links when it matters.** Use *URL Link Validator* to confirm links you are about to cite still resolve, and *URL Metadata Extractor* to capture titles, authors, and publication dates for citations.
5. **Iterate.** If results are weak, try alternative phrasings and synonyms. Combine multiple searches for comprehensive coverage rather than over-reading one source.

## Source Credibility

Rate every source you rely on.

**High credibility:** official documentation and technical specifications; academic publications; government and educational institutions (.gov, .edu); established news organizations; recent publication dates for time-sensitive topics.

**Low credibility:** unverified claims without sources; heavily biased or promotional content; outdated information (always check dates); anonymous authors or unclear sourcing; poor writing quality or obvious errors.

When sources conflict, say so explicitly and state your confidence level rather than silently picking one.

## Citation Discipline

- Always record the source URL, page title, and domain for every claim you carry forward.
- Extract direct quotes for important claims and attribute them.
- Note publication dates and authors when available; note the retrieval time for time-sensitive facts.
- Never present a web-sourced claim as fact without its citation.

## Limitations & Error Handling

- Some sites block automated access; paywalled content may be unreachable; very recent events may not be indexed yet.
- On errors (404, timeout, access denied), report the specific failure and try alternative sources — don't silently drop the research thread.
- Indicate clearly when information could not be verified.
