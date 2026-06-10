---
"@memberjunction/server": patch
---

Fix type error in SignatureWebhookHandler where req.params.driverKey could be string | string[] per Express type definitions, causing build failures in downstream projects using moduleResolution: "node" with declarationMap: true.
