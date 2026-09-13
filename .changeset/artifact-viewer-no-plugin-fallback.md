---
"@memberjunction/ng-artifacts": patch
---

**An artifact with no viewer plugin gets a file card and a real Download, not an empty pane.**

The viewer panel's display tab knew two things: a type's plugin, or the extracted markdown/HTML
attributes. A type with neither — CSV today, any new file type tomorrow — rendered nothing, and
offered no way to get the file: a file-backed version has no inline `Content`, and the panel had no
download action. First-adopter feedback: an exported exam CSV opened to a blank pane.

Now such an artifact shows a file card (name, type, size) with a Download button — file-backed
content via the pre-authenticated URL fetched to a blob so the browser saves it (falling back to
opening the URL if storage refuses the cross-origin fetch), inline content via its data URL — and
text-like content (`text/*`, JSON, XML, CSV) is fetched and shown as plain text, capped at 200 KB
with a note to download the rest. Plugins and extracted attributes still take precedence.
