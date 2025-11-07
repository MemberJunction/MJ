---
"@memberjunction/actions-base": patch
---

Fix action parameters not appearing in agent system prompts

Fixed three critical issues preventing action parameters from appearing in loop agent system prompts:

**UserViewMaxRows truncation**: Action Params entity has MaxRows=1000, loading only first 1000 of 1899+ params

The primary fix overrides LoadMultipleEntityConfigs in ActionEngineBase to pass IgnoreMaxRows=true, ensuring all action metadata is loaded regardless of entity MaxRows settings.
