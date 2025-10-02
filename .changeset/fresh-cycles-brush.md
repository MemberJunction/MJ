---
"@memberjunction/ng-skip-chat": patch
"@memberjunction/ng-react": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/react-runtime": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/server": patch
---

Add component feedback collection system for Skip-generated
components with sliding panel UI, component hierarchy visualization,
and star ratings (0-5 scale). Build GraphQL resolver for sending
feedback to Skip API with component identification via
name/namespace/version.

Update React runtime debug logging to default OFF instead of ON. Add
environment variable support for debug control via
ReactDebugConfig.setDebugMode() or window global. Remove automatic
ngDevMode override and 10+ verbose console.log statements while
preserving error/warning logs.

Fix AI parameter extraction edge cases in AIPromptRunner and
QueryEntity.
