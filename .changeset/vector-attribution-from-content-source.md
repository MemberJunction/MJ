---
'@memberjunction/search-engine': patch
---

Vector search: attribute a match from the entity its **content source** declares

`VectorSearchProvider` could attribute a match two ways: an `Entity` key in the vector's own metadata,
or an Entity Document targeting the index. Neither covers the ContentSource pipeline running
`fieldStrategy: 'explicit'`, where metadata carries only the configured fields — `ContentSourceID` is
present, the identity keys are not — and where the caller may not use Entity Documents at all.

That gap is not cosmetic. `SearchEngine.filterEntityResults` groups results by `EntityName` and
resolves each group with `EntityByName()` to evaluate CanRead and row-level security. An unresolvable
name yields no `EntityInfo`, the method returns before admitting the group, and **the results are
silently discarded** — `Residual permission filter removed N result(s)` is the only trace.

`ContentSource.EntityID` already exists and already says what a source's records are. This reads it:
when a match omits `Entity`, its `ContentSourceID` resolves through
`KnowledgeHubMetadataEngine.GetContentSourceByID()` — an O(1) lookup against an already-cached
collection — to the entity that source declares.

Two properties worth calling out, because they are why this sits where it does rather than being
inferred from somewhere else:

- **Per match, not per index.** One vector index can serve many content sources, so an index-wide
  answer is wrong as soon as a second source shares the index. `ContentSourceID` travels on the vector.
- **Declared, not guessed.** `EntityID` is set by the source's owner. Since attribution decides *which*
  entity's permissions are evaluated, an inferred name would put the wrong object's rules in front of
  the records — worse than no attribution, which merely drops them.

Declaring it per source also lets a source name an **ISA extension** instead of the base entity it
inherits from. That distinction is a security one: row-level security typically lives on the
extension, so a hardcoded or index-wide base-entity name evaluates the wrong entity's RLS.

Resolution order is most-specific-first: the match's own `Entity` key, then its content source's
declaration, then the index's Entity Documents, then `'Unknown'` as before. A source with no declared
`EntityID` is simply absent from the lookup, so its matches behave exactly as they do today.

Also fixed, both pre-existing:

- `convertMatches` applied the resolved fallback with `??` while the "does this match need one" test is
  falsy, so an `Entity: ''` resolved a name and then discarded it — the result was dropped with the
  resolution already paid for.
- `extractDisplayTitle` re-derived the entity from `meta['Entity']` rather than the resolved name, so a
  match attributed from an Entity Document (or now a content source) skipped name-field resolution
  entirely and could render as the literal `"<Entity> Record"`.

No schema change, no migration. Behaviour is unchanged for callers whose matches carry `Entity`
metadata and for any index resolving through an Entity Document.
