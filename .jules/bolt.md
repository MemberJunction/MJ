
## 2024-06-25 - copyInitData metadata bottleneck
**Learning:** Found an O(N^2) instantiation path during metadata load due to `copyInitData` utilizing `Object.keys(this).indexOf(keys[j])` in a hot loop within `BaseInfo`. Furthermore, string manipulation `.trim().toLowerCase()` on every matched key caused expensive allocations.
**Action:** Replace `indexOf` array scans with O(1) `hasOwnProperty` checks, and utilize fast-path string literal matching before falling back to lowercasing.
