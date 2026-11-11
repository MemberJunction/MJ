---
"@memberjunction/react-runtime": minor
---

Component libraries load again on pages with an opaque origin. The subresource URL check added in 6.2 resolved every script and stylesheet URL against `window.location.origin`, which is the string "null" on about:blank, srcdoc and sandboxed iframes and data: pages. Used as a base, it made `new URL` throw even for an absolute https URL, so every library (antd, d3, chart.js, …) was refused with "Refused to load script from non-http(s) URL". The React test harness renders on about:blank, so every component test that used a library failed to register. An opaque origin is now treated like no window: relative URLs resolve against https://localhost and dangerous schemes are still refused.
