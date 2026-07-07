---
"@memberjunction/ng-conversations": patch
---

Export the components `ConversationsModule` declares from `public-api` so consumers embedding `mj-conversation-chat-area` can build under Angular's local-compilation / HMR mode. 15 module-exported components (e.g. `ActionableCommandsComponent`) were missing from `public-api.ts`; a consumer app importing `ConversationsModule` and running `ng serve --hmr` failed with NG3004 ("Unable to import component … not exported from @memberjunction/ng-conversations"), while full (non-HMR) builds were unaffected. Additive re-exports only — no behavior change, no new dependencies.
