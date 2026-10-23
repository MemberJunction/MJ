---
"@memberjunction/core": patch
"@memberjunction/global": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/server": patch
"@memberjunction/ng-realtime-widget": patch
"@memberjunction/realtime-widget": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Anonymous realtime sessions are now isolated per visitor (#4931). Before, every anonymous visitor (a web-widget guest or an anonymous magic-link invitee) authenticated as the one shared Anonymous user, and the realtime session write gates compared only that user id, so a visitor who learned another visitor's session id could relay into it, close it, heartbeat it, drive its remote browser, or restore its state into a new session.

- `UserInfo.AnonymousVisitorID` (`@memberjunction/core`) carries the token's `mj_sid`. An anonymous token without `mj_sid` is refused at sign-in.
- One scope identity per session (`ResolveSessionScopeIdentity`, `@memberjunction/server`): the token's resource scope (`MagicLinkScope.ResourceID`) when it carries one, else the anonymous visitor's `mj_sid`. `SessionManager` stamps it as the session conversation's `ExternalID`, and `AuthorizeSessionAccess` compares it. A widget guest's resource scope is its `mj_sid`; redemptions of one resource-scoped anonymous invite share that scope by design and keep matching the `{{ScopeResourceID}}` row filters; redemptions of an unscoped multi-use invite are told apart by `mj_sid`.
- All five write gates (`LoadOwnedRealtimeSession`, `AgentSessionResolver`, `RemoteBrowserActionResolver`, and the `lastSessionId` restore paths in `RealtimeClientSessionResolver`) go through `AuthorizeSessionAccess`.
- `MJ: Conversations` and `MJ: AI Agent Sessions` (`@memberjunction/core-entities-server`) refuse an anonymous visitor changing `ExternalID` / `ConversationID` on an existing row, so the ownership key cannot be rewritten through generic CRUD under a role whose row filter is by user id.
- `POST /widget/session/refresh` now requires the current guest token as `Authorization: Bearer <token>` (accepted up to 300 s after it expires) and keeps its `mj_sid`, so a refreshed guest keeps its session, its row filters and its session-events subscription. `WidgetKeyClient.Refresh(currentToken)` (`@memberjunction/ng-realtime-widget`) and `WidgetSessionClient.Refresh(currentToken, visitorKey?)` (`@memberjunction/realtime-widget`) send it.

**Deploy together:** a widget bundle older than this release refreshes without a token and gets 403 at its first refresh. An anonymous magic-link session without a resource scope that was started before the deploy is refused after it; the visitor starts a new session.
