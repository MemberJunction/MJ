---
"@memberjunction/ai-core-plus": patch
"@memberjunction/scheduling-engine": patch
"@memberjunction/ng-explorer-core": patch
---

Expose canonical `ConversationUtility.ResolveRecordLinkLabel`, `ConversationUtility.CleanMentions`, and `ConversationUtility.CleanHtmlMentions` helpers in `@memberjunction/ai-core-plus`; refactor `UserRoutineDispatcherDriver` and Explorer's `UserNotificationsComponent` to use them directly (removing duplicate mention-cleaning helpers) and clean mention tokens inside HTML-only notification bodies as well. Also remove obsolete `.mj/specs/` planning folders and update `rhythm-model-tiers.spec.ts` to assert against `migrations-pg/v6/V202611220625__v6.3.x__Rhythm_Model_Tiers.pg.sql`.
