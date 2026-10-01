---
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-explorer-core": patch
---

ArtifactsModule no longer preloads React, ReactDOM and Babel from unpkg when it is constructed, so apps that only import a realtime overlay (e.g. a public voice widget) make no third-party CDN requests at bootstrap. MJ Explorer keeps the warm cache by calling AngularAdapterService.Preload() after login. Other hosts that render interactive component artifacts and want a warm cache can call `inject(AngularAdapterService).Preload()` (from `@memberjunction/ng-react`) after authentication; otherwise the runtime loads on first use.