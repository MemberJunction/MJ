---
"@memberjunction/core-actions": patch
---

The Web Page Content action no longer blocks the server while it converts a page. HTML-to-Markdown/text conversion (jsdom + turndown) and PDF text extraction (pdf-parse) now run on a worker thread, so a large page no longer holds every HTTP request and WebSocket on the process (MJ #5510); on an 870KB page the worst `/healthcheck` wait dropped from about 0.6s to 15ms. The output is unchanged. If the worker cannot start or keeps crashing, conversion runs in-process as before; set `MJ_WEB_CONTENT_IN_PROCESS=true` to force that. Also fixes PDF extraction that failed with "bad XRef entry" or "Command token too long" for some PDFs, depending on their size and the Node version: the bytes now reach pdf-parse as a plain `Uint8Array`, the one input shape its bundled pdf.js 1.10 reads correctly everywhere.
