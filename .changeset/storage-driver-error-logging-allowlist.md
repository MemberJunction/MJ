---
"@memberjunction/storage": patch
---

Log named diagnostic fields from Box and Dropbox SDK errors instead of the whole error object

`BoxFileStorage` and `DropboxFileStorage` each serialised a caught SDK error
wholesale under a `fullError` key. Neither was leaking a credential — Box's SDK
redacts `Authorization` on every serialisation path, and Dropbox's error carries
only status, a `Headers` instance that flattens to `{}`, and the parsed error
body — but the redaction is the SDKs' promise, not ours, and it never covered
Box's `requestInfo.body`.

Both drivers now build a bounded, named set of diagnostics (`describeBoxError` /
`describeDropboxError`), and a source guard keeps wholesale serialisation and
`|| error` fallbacks out of every driver in the package.

Also fixes a latent bug found while doing it: `BoxFileStorage` read `statusCode`,
`code` and `context_info` from the flat `box-node-sdk` v3 error shape, all of
which are `undefined` on the v10 SDK the package depends on. Those three log
fields were always empty, and the 409-conflict handling in `PutObject` — which
returns success when the file already exists — could never fire.
