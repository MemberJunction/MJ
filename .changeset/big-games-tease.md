---
"@memberjunction/core": minor
"@memberjunction/ng-react": patch
"@memberjunction/react-runtime": patch
---

ix: Improve React component system registry handling and chart
flexibility

- Enhanced component manager to optimize pre-registered component loading
  by skipping redundant fetches
- Fixed SimpleChart component to accept any field for grouping, not just
  numeric fields
- Removed backup metadata file to clean up repository
- Added support for components with pre-populated code in the registry
- Improved dependency resolution for local registry components
- Better logging for component loading optimization paths
