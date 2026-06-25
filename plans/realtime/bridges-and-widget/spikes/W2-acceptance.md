# W2 — Widget metadata: acceptance (DB restored 2026-06-25)

**Status: DONE** ✅ — both W2 acceptance criteria verified against the live DB after the mid-session
outage was resolved. Spike: [`w2-guest-permission-spike.ts`](./w2-guest-permission-spike.ts) (throwaway).

## 1. Metadata seed pushed
`npx mj sync push --dir=metadata --include="roles,entity-permissions,widget-instances"` →
**4 created** (Widget Guest role, 2 entity permissions, 1 widget instance), 0 errors. mj-sync stamped
the assigned `primaryKey` + `sync` blocks back into the seed files (committed).

## 2. "A widget key resolves through metadata to app+agent+role+origins" ✅
```
pk_test_example_support_widget → App=Chat · PinnedAgent=Sage · GuestRole=Widget Guest
                                 · Modality=Both · AuthStrategy=Anonymous · Status=Active
```

## 3. "The guest role cannot read arbitrary entities (verify with a denied RunView)" ✅
The Widget Guest role's COMPLETE entity-permission set is exactly two rows
(`MJ: Conversations`, `MJ: Conversation Details` — read/create/update, no delete); MJ is default-deny,
so every other entity is unreachable. Proven empirically by the spike, which synthesizes the guest
principal (shared Anonymous user + Widget Guest role, exactly as `buildMagicLinkSessionUser` does) and runs
two RunViews:
```
GRANTED  'MJ: Conversations' → Success=true   (allowed)
DENIED   'MJ: AI Models'      → Success=false  "User anonymous@magic-link.local does not have
                                                 read permissions on MJ: AI Models"
```

This is the live confirmation of the D5 boundary: the pinned agent (Sage here; a support-scoped agent
in production) + the restricted Widget Guest role together confine a public visitor.
