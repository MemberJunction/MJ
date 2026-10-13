# @memberjunction/worker-host

Runs CPU-heavy server work on a long-lived worker thread, so it cannot block the event loop that serves requests. **Node only.**

MJAPI serves every HTTP request and WebSocket from one event loop. Synchronous work on that loop, such as model inference or HTML and PDF parsing, holds every request on the process until it finishes (MJ #5510). This package moves one kind of such work onto a worker thread.

## What you get

- **One worker per host.** It starts on the first call and is reused. While idle it is `unref`'d, so it never keeps a process alive.
- **Crash recovery.** A worker that errors or exits rejects every pending call, and the next call starts a new worker.
- **A fallback.** After 3 worker deaths within 60 seconds, the host disables itself for the life of the process. `IsAvailable` then returns `false`, and callers run the work in-process, as they did before the worker existed.
- **An off switch.** Each host names an environment variable. Setting it to `true` keeps the work in-process.

## Usage

A host has three parts: the calls, the worker script, and the host class.

```typescript
// thumbnails/ThumbnailProtocol.ts — the calls
export interface ResizeCall {
  Kind: 'resize';
  Image: Uint8Array;
  Width: number;
}
export type ThumbnailCall = ResizeCall;
```

```typescript
// thumbnails/ThumbnailWorker.ts — the worker script
import { ServeWorkerRequests } from '@memberjunction/worker-host';
import type { ThumbnailCall } from './ThumbnailProtocol';

ServeWorkerRequests<ThumbnailCall, Uint8Array>(async (call) => {
  const resized = resizeImage(call.Image, call.Width); // synchronous, CPU-heavy
  return { Result: resized, Transfer: [resized.buffer] }; // transfer, don't copy
});
```

```typescript
// thumbnails/ThumbnailWorkerHost.ts — the host
import { fileURLToPath } from 'node:url';
import type { TransferListItem } from 'node:worker_threads';
import { WorkerThreadHost } from '@memberjunction/worker-host';
import type { ThumbnailCall } from './ThumbnailProtocol';

export class ThumbnailWorkerHost extends WorkerThreadHost<ThumbnailCall, Uint8Array> {
  protected constructor() {
    super({
      Name: 'Thumbnail worker',
      InProcessEnvVar: 'MJ_THUMBNAILS_IN_PROCESS',
      ScriptPath: fileURLToPath(new URL('./ThumbnailWorker.js', import.meta.url)),
      LogPrefix: '[Thumbnails]',
      FallbackDescription: 'Resizing on the main thread',
    });
  }

  public static get Instance(): ThumbnailWorkerHost {
    return super.getInstance<ThumbnailWorkerHost>();
  }

  // Optional: buffers to move to the worker instead of copying them.
  protected override TransferListFor(call: ThumbnailCall): TransferListItem[] {
    return call.Image.buffer instanceof ArrayBuffer ? [call.Image.buffer] : [];
  }
}
```

The caller checks `IsAvailable` and keeps an in-process path:

```typescript
const host = ThumbnailWorkerHost.Instance;
const thumbnail = host.IsAvailable
  ? await host.Run({ Kind: 'resize', Image: bytes, Width: 200 })
  : resizeImage(bytes, 200);
```

**Resolve `ScriptPath` in the host's own module**, as above. It then points beside the compiled host in `dist/`, wherever the package is installed.

## Testing a host

`UseScriptPath(path)` points a host at a stand-in worker script and resets its state. The stand-in can be a plain `.mjs` file that answers each request with `{ ID, Ok: true, Result }` or `{ ID, Ok: false, Error }`. Call `Shutdown()` and `UseScriptPath(null)` after each test.

## Users

- `@memberjunction/ai-local-embeddings`: local embedding inference (`EmbeddingWorkerHost`)
- `@memberjunction/core-actions`: Web Page Content's HTML and PDF conversion (`WebContentWorkerHost`)
