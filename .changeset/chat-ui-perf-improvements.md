---
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-base-application": minor
---

Chat UI perf improvements (no functional changes, purely UX latency wins). Five surgical changes against the observed pain points in MJ Explorer's conversation UI under heavy entity catalogs:

1. **`AgentStateService` — push-driven instead of timer-polling.** Subscribes to `ConversationStreamingService.completionEvents$` so agent-run state changes propagate to the UI the moment the server publishes them, instead of waiting on the next poll tick. The fallback poll cadence is relaxed from 30s → 5min (safety net for missed pushes, no longer the primary state signal). Public API (`startPolling` / `stopPolling`) unchanged.

2. **Optimistic UI on `MessageInputComponent.sendMessageWithText`.** Pre-assigns a client-side UUID to the new `ConversationDetailEntity` and emits `messageSent` BEFORE awaiting `Save()` — so the typed message appears in the thread instantly rather than after the server round-trip. New `@Output() messageSendFailed` event fires when save fails OR when the existing attachment-rejection rollback deletes the row, so parents can pull the optimistic message back out of the thread under failure.

3. **`ArtifactViewerPanelComponent` — defer version-attribute load off the critical path.** `loadVersionAttributes()` was being awaited before `isLoading = false`, blocking the spinner from clearing even though the artifact body is independent of version attributes (only the Display tab consumes them). Now fires async — body becomes interactive immediately, Display tab populates a moment later when attributes arrive (`hasDisplayTab` is false until then, so no flash of empty content).

4. **`WorkspaceStateManager` — diff-detection on persist.** The existing 500ms debounce merges bursts within a window but distinct same-value re-emits (focus events, parent re-renders) still triggered redundant `Save()` round-trips. New `lastPersistedConfigJson` tracker short-circuits the save when the serialized config is identical to what was last persisted. Real mutations still save normally; idle no-ops are skipped.

5. **`ConversationChatAreaComponent` — clean-swap on conversation switch.** Previously, when the engine had cached data for the target conversation, `onConversationChanged` skipped clearing `messages` and relied on `loadMessages` to swap in the new data later — which left the *previous* conversation's messages on screen until the swap completed (the "shows the same chat it came from" bug during a fast switch). Now ALWAYS clears `messages` + sets `isLoadingConversation = true` + calls `detectChanges()` immediately when conversationId flips, regardless of cache state. The user sees a clean "loading conversation" state in every switch case; `loadMessages` then repopulates fast (cache hit) or normally (DB read). No stale-display gap, no risk of cache-induced confusion.
