---
"@memberjunction/ng-explorer-core": patch
---

Fix conversation deep links opening the previously-viewed conversation

On a cold load — a deep link opened in a fresh browser tab, which is every click of a Slack/Teams "open conversation in MJ Explorer" link — the chat resource wrapper restored the workspace tab carrying the **previous visit's** `queryParams`, and nothing reconciled them against the URL actually being opened: the shell's URL-is-source-of-truth sync runs on router navigation events, not at boot. The link therefore opened whatever conversation was last viewed, which reads as the link being broken.

The live URL now takes precedence for `conversationId` and `artifactId`. Ordinary in-app navigation is unchanged: when the URL carries no such parameter, the saved configuration is used exactly as before.

The rule is extracted into `resolveDeepLinkParam` (`chat-deeplink-params.ts`) so it is unit-testable without Angular scaffolding; 6 tests added.
