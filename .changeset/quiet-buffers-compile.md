---
"@memberjunction/server": patch
---

Fix the MJServer build failing under `npm install`. The constant-time system-API-key comparison passed a `Buffer` to `crypto.timingSafeEqual`, which TypeScript 5.9 rejects against the root `@types/node@20.14.2` override (non-generic `Buffer`) even though the package's own declared `@types/node@24.10.11` accepts it — so `npm ci` built green while `npm install` failed. Wrapping the digests in `Uint8Array.from(...)` compiles under both type versions; no runtime change and the comparison stays constant-time.
