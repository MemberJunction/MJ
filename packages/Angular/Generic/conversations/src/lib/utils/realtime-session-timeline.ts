/**
 * Realtime-session timeline grouping — re-exported from `@memberjunction/conversations-runtime`.
 *
 * The grouping pass was always pure TypeScript, but purity is not the same as living in the right
 * package: while the only implementation sat behind an Angular import, the React Native thread
 * rendered every session-stamped row as an ordinary chat bubble — the exact thing the module's own
 * header calls wrong. It now lives in the runtime every surface shares.
 *
 * This file stays so the eleven call sites in this library keep importing from where they always
 * did. Import from `@memberjunction/conversations-runtime` in new code.
 */
export {
  BuildConversationTimeline,
  CollectRealtimeSessionIDs,
  FindRealtimeSessionMeta,
  IsVisibleRealtimeTurn,
  MapRealtimeSessionMeta,
  REALTIME_SESSION_META_FIELDS,
  SessionCardIsSameDayRange,
  SessionCardStatusChip,
  SessionCardTitle,
  type ConversationTimelineItem,
  type RealtimeSessionMetaRow,
  type RealtimeSessionStatusChip,
  type RealtimeSessionTimelineGroup,
  type RealtimeSessionTimelineMeta,
  type RealtimeTimelineSourceDetail,
} from '@memberjunction/conversations-runtime';
