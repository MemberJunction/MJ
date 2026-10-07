---
"@memberjunction/global": patch
---

Add `TrimTrailingSlashes()`, a linear way to strip trailing `/` from a base URL. The common `/\/+$/` regex backtracks quadratically on input full of slashes that are not at the end, so it is a denial-of-service vector on caller-supplied URLs. The realtime widget's auth clients and the server's verification link builder now use it.
