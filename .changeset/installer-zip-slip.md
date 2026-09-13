---
"@memberjunction/installer": patch
---

Installer: refuse archive entries that resolve outside the extraction directory (zip slip, CWE-22).

`FileSystemAdapter.ExtractZip` joined each archive entry name onto the target directory without checking the result, so a release archive carrying an entry such as `../../.bashrc` or an absolute path would have been written wherever it pointed, with the installer's privileges. Entries are now resolved against the target root and any that land outside it abort the extraction with a clear error. Well-formed archives, including GitHub zipballs with their single wrapper folder, extract exactly as before.
