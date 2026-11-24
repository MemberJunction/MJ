---
"@memberjunction/communication-engine": patch
"@memberjunction/server": patch
"@memberjunction/integration-test-suite": patch
---

Communications V2 open and click tracking routes no longer read the database on the request.

- `GET /comms/click/:token` accepts a hit on its HMAC signature alone; the lookup of the tracking token on `MJ: Communication Logs` is gone from the route.
- Open pixels are now signed (`/comms/open/<token>.gif?sig=...`, new `ComputeOpenPixelSignature` / `VerifyOpenPixelSignature`), and a signed pixel is accepted the same way. A pixel with no signature (mail already sent, or no `MJ_COMMS_HMAC_SECRET`) is still looked up.
- Open and click hits are held in memory (`CommsTrackingEventBuffer`) and published to `comms.activity` in batches, one second later or when 500 are waiting. A hit in the buffer when the process dies is lost, and a batch the queue refuses is dropped. Unsubscribes and provider webhooks are unchanged.
- The `comms.activity` worker drops an open or click hit whose tracking token matches no log, without recording it or reporting an error (`ProcessActivityBatchResult.UnmatchedCount`).
- Rotating `MJ_COMMS_HMAC_SECRET` now also stops opens of mail already sent from being recorded.
