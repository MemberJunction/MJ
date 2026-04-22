---
"@memberjunction/core-entities": patch
"@memberjunction/ng-dashboards": patch
---

Extend MCPEngine with a cached `Favorites` property (`MJ: MCP Tool Favorites`) backed by BaseEngine's `CacheLocal` + event-driven cache sync. Adds `GetFavoritesByUser(userId)` and `GetFavoriteByUserAndTool(userId, toolId)` helpers. MCP Dashboard's `loadFavorites` and `toggleFavorite` paths now read the engine cache instead of issuing per-call RunViews against `MJ: MCP Tool Favorites`; Save/Delete on the favorite entity still flows through BaseEntity so the cache stays consistent across tabs via auto-invalidation.
