# Streaming (HTTP Range) Downloads

`@memberjunction/storage` exposes a first-class **streaming** capability so large media
(audio/video) can be served over HTTP `Range` requests **without buffering the whole
object in memory**. This complements `GetObject`, which returns the entire object as a
`Buffer` and is only appropriate for small payloads you genuinely need fully in memory.

## TL;DR

```typescript
if (!storage.SupportsStreaming) {
  // Provider can't stream — fall back to GetObject (buffers the whole object)
  res.end(await storage.GetObject({ objectId }));
  return;
}

const result = await storage.GetObjectStream({
  objectId,                          // prefer the provider-native key (bypasses path resolution)
  Range: { Start: 0, End: 1_048_575 } // first 1 MiB, INCLUSIVE; omit `End` to stream to EOF
});

res.status(result.ContentRange ? 206 : 200);
if (result.ContentType)   res.setHeader('Content-Type', result.ContentType);
if (result.ContentLength != null) res.setHeader('Content-Length', String(result.ContentLength));
if (result.ContentRange) {
  const { Start, End, Total } = result.ContentRange;
  res.setHeader('Content-Range', `bytes ${Start}-${End}/${Total}`);
}
result.Stream.pipe(res); // Node Readable → HTTP response, never fully buffered
```

## Introspection contract: `SupportsStreaming`

```typescript
public get SupportsStreaming(): boolean
```

- Base default is **`false`**. Streaming-capable drivers override it to `true`.
- **Callers MUST check `SupportsStreaming` before calling `GetObjectStream`**, or be
  prepared to catch `StreamingNotSupportedError`.

## `GetObjectStream`

```typescript
public GetObjectStream(params: GetObjectStreamParams): Promise<ObjectStreamResult>
```

### Parameters — `GetObjectStreamParams`

| Field | Type | Notes |
|---|---|---|
| `objectId` | `string?` | Provider-native key (Box file ID, S3 key, Azure blob name). Fast path — bypasses path resolution. Mirrors `GetObject`. |
| `fullPath` | `string?` | Full path (e.g. `media/video.mp4`). Slow path. Provide `objectId` **or** `fullPath`. |
| `Range`    | `{ Start: number; End?: number }?` | **Inclusive** byte range (HTTP `Range` semantics). Omit `End` to stream from `Start` to EOF. Omit `Range` entirely to stream the whole object. |

### Result — `ObjectStreamResult`

| Field | Type | Notes |
|---|---|---|
| `Stream` | `Readable` | Node.js readable stream — pipe it to the HTTP response. |
| `ContentType` | `string?` | MIME type when known from the provider. |
| `ContentLength` | `number?` | Bytes in the returned slice (ranged read) or total object size (full read). Use for `Content-Length`. |
| `ContentRange` | `{ Start; End; Total }?` | Present **only** when a `Range` was honored. `Start`/`End` are inclusive; `Total` is the full object size — enough to emit `Content-Range: bytes Start-End/Total` and a `206 Partial Content`. |

### Range semantics

- The range is **inclusive** on both ends, exactly like HTTP `Range`/`Content-Range`.
  `{ Start: 0, End: 1023 }` returns 1024 bytes (`Content-Length: 1024`).
- Omitting `End` (`{ Start: 500 }`) streams from byte 500 to EOF.
- The shared helper `BuildHttpRangeHeader(range)` encodes this as
  `bytes=Start-End` (or `bytes=Start-` for open-ended) and is used uniformly by the
  streaming drivers.

## Fallback: `StreamingNotSupportedError`

Drivers that don't support streaming inherit the base default implementation of
`GetObjectStream`, which **throws** `StreamingNotSupportedError` (the message names the
provider). There are no boilerplate stubs in those drivers, and their `SupportsStreaming`
stays `false`. Recommended caller pattern:

```typescript
try {
  const result = await storage.GetObjectStream({ objectId, Range });
  // ...stream it
} catch (e) {
  if (e instanceof StreamingNotSupportedError) {
    // graceful degradation: buffer the whole object instead
    res.end(await storage.GetObject({ objectId }));
  } else {
    throw e;
  }
}
```

## Provider support

| Provider | `SupportsStreaming` | Backing SDK call |
|---|---|---|
| **Box** | ✅ `true` | `downloads.downloadFile(fileId, { headers: { range } })` → readable stream. Size/content-type are sourced from `GetObjectMetadata` (the Box stream call doesn't surface them). |
| **AWS S3** | ✅ `true` | `GetObjectCommand` with `Range`; `Body` is a Node `Readable`; `ContentType`/`ContentLength`/`ContentRange` come straight off the response. |
| **Azure Blob Storage** | ✅ `true` | `BlobClient.download(offset, count)` → `readableStreamBody`; inclusive range maps to `count = End - Start + 1`. |
| **Google Cloud Storage** | ❌ `false` | Future enhancement (`createReadStream` supports `start`/`end`). |
| **Google Drive** | ❌ `false` | Future enhancement. |
| **Dropbox** | ❌ `false` | Future enhancement. |
| **SharePoint** | ❌ `false` | Future enhancement. |

Providers marked ❌ throw `StreamingNotSupportedError` from `GetObjectStream` and report
`SupportsStreaming === false`.
