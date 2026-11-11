---
"@memberjunction/ng-artifacts": patch
---

Fix the artifact viewer failing with "No artifact version found" for users whose read of MJ: Artifact Versions is row-level-security filtered. The viewer now filters collection and conversation-link rows by the version IDs it already holds instead of a subquery on the Artifact Versions base view, which the API refuses for those users.
