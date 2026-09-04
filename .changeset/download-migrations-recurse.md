---
'@memberjunction/open-app-engine': patch
---

`DownloadMigrations` fetches what skyway will actually run, and an empty download fails instead of passing.

Two defects in the same function. It listed the migrations directory **non-recursively**, while the local scanner (`RuntimeSchemaManager.collectFilesRecursively`) walks the tree — so a migration in a subdirectory applied correctly under a local `mj migrate`, was never downloaded to a host, and both sides reported success. The walk now mirrors the scanner, preserves each file's path relative to the migrations root (flattening `file.name` would let two same-named migrations in different subdirectories overwrite each other), and is bounded to 6 levels so a pathological tree cannot be walked forever.

Second, zero `.sql` files returned `Success: true, Files: []`. This function is only reached because a manifest declared a migrations directory, so an empty download is a defect — and treating it as success let an install proceed past the migration phase, record the app as installed, and leave the host with an empty schema and a green result. It now fails with a message naming `migrations.directory` in `mj-app.json` and the ref that was searched.
