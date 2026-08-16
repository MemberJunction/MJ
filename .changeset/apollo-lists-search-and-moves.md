---
"@memberjunction/actions-apollo": patch
---

Add Apollo's other half to this package: **list management, saved-record search and prospecting**, as seven new actions alongside the two enrichment actions it has always had.

`ApolloGetListsAction` and `ApolloCreateListAction` read and create labels; `ApolloGetListAccountsAction` and `ApolloGetListContactsAction` page through a list's members; `ApolloSearchPeopleAction` searches Apollo's people database for net-new prospects; `ApolloMoveListAccountsAction` and `ApolloMoveListContactsAction` move records between lists. Together they are the outbound-campaign surface — build a list, drain it through a sequence of stages, and see what is where — which enrichment alone cannot express.

These go to a **different Apollo base path** from enrichment: `api.apollo.io/api/v1` rather than `api.apollo.io/v1`. They are not interchangeable, and the same path under the wrong prefix 404s, so `ApolloRESTEndpoint` is declared beside the existing `ApolloAPIEndpoint` rather than derived from it.

Five Apollo behaviours dictate the design, and each is what makes the naive implementation wrong:

**A PATCH replaces the whole `label_names` array.** There is no add-one-label endpoint, so a move is *two* writes, each carrying the complete intended set: first `current ∪ {toList}`, then `(current ∪ {toList}) \ {fromList}`. Sending a bare `['Warm']` would silently delete every other list the record was on, and nothing in the response would reveal it. The remove set is computed from the *post-add* state, not from the pre-add state — deriving it from `current` alone would add the record to the destination and then immediately take it back out. The move actions accept only ids from the caller, never labels, and re-read the source list themselves, so a caller cannot supply a stale label set that quietly destroys memberships the record picked up since they last looked.

**Roughly 15-17% of removes return success without applying.** Removes are verified by re-reading the destination list, and a record still carrying the source label is reported as `possiblyStuck` rather than retried — an immediate retry flakes the same way, while the next page-1 drain sees it carrying both labels and finishes the job. A possibly-stuck record is deliberately **not** a failure: the write succeeded and Apollo did not honour it, so calling it a failure would send the caller looking for a bug in the request. `PARTIAL_FAILURE` is reserved for a PATCH that actually failed. When the verify read itself fails, or the record is simply not on the destination page, the stuck state is left `null` — unknown, not verified-clean.

**A list drain must always read page 1**, because removals shift every later page, so advancing to page 2 skips records. Paging therefore defaults to page 1 rather than to a saved position, and the move actions pin it explicitly.

**Label reads and every write require a MASTER key.** A scoped key authenticates fine and then 403s, which is indistinguishable from a wrong key — so a 403 on a master-key operation is rewritten into a message that names the requirement instead of passing the bare status through. The prospecting search is the one read a scoped key can serve, so it deliberately skips the label fetch the other searches need.

**Labels are read as `label_ids` but written as `label_names`.** The client fetches the label list once per instance and resolves ids to names on every read; an id with no matching label is dropped rather than passed through, since a raw id inside a `label_names` write would create a label named after a hex string.

`ApolloCreateListAction` is idempotent — a same-named label is returned as-is with `AlreadyExisted: true`. Apollo will happily create two labels with one name, and once it has, every name-based lookup in this surface becomes ambiguous: half the moves would target one list and half the other. Idempotent create is what keeps name-addressing sound. `ApolloSearchPeopleAction` requires at least one filter; Apollo accepts a request with none and returns an unscoped, rate-limit-burning result set nobody asked for.

Credentials resolve through `CompanyID` → the company's active `Apollo` **MJ: Company Integrations** row → `CredentialID` → the `apiKey` in **MJ: Credentials** `Values`, falling back to `APOLLO_API_KEY` so existing single-tenant deployments keep working untouched. `CompanyIntegration.APIKey` is deliberately not read: it is not a decrypt-on-read field, so a key written through metadata sync comes back as the literal `$ENC$…` ciphertext and produces a 401 that looks exactly like a wrong key. A credential that exists but will not parse fails with `CONFIGURATION_ERROR` rather than silently borrowing another workspace's key from the environment.

92 tests cover the surface, driving the client through an injected `fetch` so the request bodies Apollo would receive are asserted directly — which matters more than usual here, because a move that sends the wrong label array is invisible in the response. Nothing in the suite can reach api.apollo.io: a live read would spend credits and a live write would mutate a real account's lists with no undo.

The two enrichment actions are unchanged.

`patch`, not `minor`, despite being additive: every MJ package shares one `fixed` group in `.changeset/config.json`, so `minor` is reserved for branches that change the database — a migration, or `metadata/**`, which becomes one at release. New actions are neither.
