---
"@memberjunction/ai-vectors-memory": patch
---

K-Means no longer returns fewer than k clusters when a cluster loses all its points. An empty cluster now takes the point farthest from its own centroid, from a cluster that keeps at least one member, under every metric. When every point already sits on its centroid (fewer distinct points than k) the old centroid is kept, as before.
