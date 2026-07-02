# P6 — ViewType Plug-in Architecture — Amith's detailed design (raw, verbatim)

> Captured 2026-06-07. This is Amith's design direction for the P6 ViewType plug-in work,
> to be tackled AFTER the current taxonomy-hierarchy + IA-split + PR work is finished.
> Do NOT lose this. Review → update the plan doc to reflect this design → ask questions →
> investigate + propose on the ONE specific item flagged → then finalize before implementing.

---

So here's the general approch I want to take for the P6 stuff on View Type plug in:

* First, I think our ViewTypeID on the UserView table needs an explanation - that is just the
  current configuration of the view type for that view. User can switch between view types as
  you can see in the entity-viewer component. Right now we don't persist this, I don't think.
  The concept of view type hasn't been a historically top level concept. I think we might have
  this in DisplayState interface but it is burreid in there

* What was our plan for storing the view type specific metadata, using the `Configuration` or
  similar named field in the table? That is a key thing to figure out as we'll need to store the
  view type specific JSON that is encapsulated into each view types' plugin - and its own JSON.
  BUT, we need to store any other parallle configuration for other view types. So I think the
  configuration JSON where we store this actually needs to be Array<Record<string, any>> where
  string is the name of the view type (or the UUID to be certain of no conflict in view type
  names) and the any side of the Record is whatever that particular view type has configured.
  That way if a user has a map view as the current and selected cholorpleth option there but in
  the timeline view selected some options, if they switch back they still have all those
  attributes.

* We should take all existing view types that are in place - we have 4 - list, card, timeline
  and map - and those are all View Types. We should put those in view type metadtaa if not
  already done and make sure the components for those use the new interface so they are proper
  plugins registered the new way

* Then we implement the new view type plugin for the cluster and this view type would only make
  itself available if there is an Entity Doc for a given entity that has vectors - same way we
  determine what can cluster in the KH app - we should make sure we don't repeat this logic and
  use exact same viewer class and helper method, just call it from a thin wrapper.

* Make sure we don't create a circ dep by having clustering stuff imported into the
  ng-entity-viewer, ng-clustering should be under Angular/Generic, make sure this is the case,
  and it probably can be imported by entity-viwer but make sure clean

* Then we have metadata for cluster view type and after that you should be able to test creating
  a view - and the idea woudl be go create a view in Data Explorer for say AI Models and try with
  all rows but then try with a filtered view like just LLMs and then the cluster would be pssed
  only those rows. We'd have to be smart about how to do this as the vectors would be for all rows
  in the entity - so think on this bit and propose how we do that to be fast/effiicent. We do have
  IDs in the vector DB as metadata but needs to be vector db providre independent. On this one
  point I want proposal after you study before you implement.

* GEtting back to the overall view type plugin architecture and implmenetation, these are the
  major bits - whoel idea is totally generic pluggable thing and anyone can define their own view
  types and plug in an Angular class that implements the interface for the viewer and anotehr
  angular class that implements the prop sheet interface, provide signaling on if the view type is
  avaialble for a given entity dynamically so it appears/doesn't appear as an option in the
  ng-entity-viewer wrapper class, and so on

So, review this, update our plan doc to reflect my dertailed ddesign, ask questions, investigate
and propose on the one specific thing I asked for and then we finalize this.

---

## My (assistant) working notes on what this entails — to expand after current work

Key deliverables when I pick this up:
1. **Explain/persist `UserView.ViewTypeID`** — it's the view's *current* selected view type. Today
   the selection likely lives buried in `DisplayState`; surface it properly (the v5.40 migration
   already added `UserView.ViewTypeID`).
2. **Per-view-type config storage** — design the `Configuration` (JSON) as an
   `Array<{ viewTypeId: string (UUID), config: Record<string, any> }>` (or map keyed by ViewType
   UUID) so EACH view type keeps its own settings in parallel (switching map↔timeline preserves
   both). Confirm where this lives (UserView.DisplayState vs a dedicated column). NOTE: root
   CLAUDE.md bans `any` — use `Record<string, unknown>` / a typed JSON interface, ask user if a
   true `any` is unavoidable.
3. **Migrate existing 4 view types (List/Grid, Cards, Timeline, Map) to the plug-in interface** +
   ensure their ViewType metadata rows exist (seed via metadata-sync, not SQL).
4. **Cluster ViewType plug-in** — `IsAvailableFor(entity)` true only when the entity has an Entity
   Document with vectors (reuse the EXACT KH availability logic + the same scatter viewer + helper
   via a thin wrapper — do NOT duplicate).
5. **No circular deps** — ng-clustering (Angular/Generic) may be imported by ng-entity-viewer
   (Angular/Generic); verify clean, no clustering import leaking the other way.
6. **Filtered-view → cluster subset (THE PROPOSAL ITEM)** — a view may be filtered (e.g. AI Models
   filtered to just LLMs); cluster must receive ONLY those rows, but vectors exist for ALL rows.
   Need a fast, vector-DB-provider-independent way to fetch/cluster just the filtered IDs (IDs are
   in vector DB metadata). **Investigate + propose before implementing.**
7. **Generic pluggable architecture** — anyone can register a viewer class (impl viewer interface)
   + a prop-sheet class (impl prop-sheet interface) + an availability predicate, and it shows up in
   the ng-entity-viewer switcher dynamically.

Process: review → update plan doc (plans/knowledge-hub-unified-plan.md Phase 6 section) → ask
clarifying questions → investigate + propose ONLY on item #6 first → finalize with user → then build.
