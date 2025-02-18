---
"@memberjunction/ng-skip-chat": patch
---

Clean up notifications from push status updates and wire up to Load() instead of ngOnInit because if the provider is different from the default one we won't get notifications in multi-provider application contexts
