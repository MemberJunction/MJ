---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/core-actions": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Semantic graph: path finding, ambiguity reporting, and deterministic domain proposals (minor because it adds action, agent-binding and remote-operation metadata).

- `GraphEngine.FindPath` returns the fewest-hop path between two nodes that the caller may see, using the same permission-checked traversal as `Subgraph`; `DescribePathForPrompt` renders it. A hidden endpoint gets the same answer as an unconnected one.
- `CanonGraphEngine.ResolveConcepts` classifies concept matches as `Matched`, `Ambiguous` or `NoMatch` (`ClassifyConceptMatches`). A fragment or shared name that fits several concepts is ambiguous; a question that names several concepts is not. `FindConcepts` is unchanged.
- `CanonGraphEngine.ResolveGraphEndpoint` and `FindPathBetween` resolve a record or concept endpoint and stop with `AmbiguousEndpoint` or `EndpointNotFound` before searching.
- New action `Find Graph Path` and remote operation `Graph.FindPath` (server body `GraphFindPathServerOperation`) both run `FindPathBetween`.
- `Get Graph Context` now returns `AMBIGUOUS_CONCEPT` (with `Candidates`) and `NO_MATCH` instead of a plain `SUCCESS`, plus a `Resolution` output. Callers that treated every success as `SUCCESS` should accept the two new codes, which both have `Success: true`.
- `ProposeEntityDomains` / `CanonGraphEngine.ProposeDomainConcepts` group entities into candidate business domains with Louvain community detection over foreign-key and IS-A links (deterministic, no AI). New action `Propose Canon Domains` returns them (dry run by default) or writes them as `Proposed` `Domain` concepts with `Inferred` + `Proposed` `Describes` edges via `SaveDomainProposals`.
- `Database Research Agent` and `Query Strategist` gain `Get Graph Context` and `Find Graph Path`.
