---
"@memberjunction/conversations-runtime": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/mobile-app": patch
"@memberjunction/server": patch
---

Voice and text now share a conversation properly, in both directions and on both surfaces.

**Context flows into a voice session.** `ConversationMessages` was a hardcoded `[]` with an MVP
note, so a call started mid-thread opened knowing nothing about what had been typed — the symptom
being the agent asking the user to repeat something they had just written. The consumer had been
written all along; only the plumbing was missing. The conversation's turns are now hydrated at
session mint under the same caps the session-resume path uses (newest 30 turns, 8,000 characters,
oldest dropped first). Because voice turns are themselves conversation rows, a resumed session
would otherwise receive its previous leg twice, so the prior-transcript loader returns its leg ids
and those legs are excluded; earlier calls that are not being resumed stay in.

**Voice sessions collapse in the mobile thread.** The realtime-session timeline grouping and the
card's presentation logic move from `ng-conversations` to `@memberjunction/conversations-runtime`
(`BuildConversationTimeline`, `SessionCardTitle`, `SessionCardStatusChip`,
`SessionCardIsSameDayRange`, `CollectRealtimeSessionIDs`, `MapRealtimeSessionMeta`,
`FindRealtimeSessionMeta`, `IsVisibleRealtimeTurn`). The module was always pure TypeScript — and
its own header already said rendering session-stamped rows as chat bubbles was wrong — but living
behind an Angular import meant the React Native thread did exactly that. Both surfaces now run the
same pass. `ng-conversations` re-exports from `lib/utils/realtime-session-timeline`, so its call
sites are unchanged, and the Angular card delegates to the promoted functions instead of keeping
its own copies.

Mobile renders the collapsed card natively, expandable in place to the turns it counted, with a new
`realtimeSessionCard` slot so a host can replace it.
