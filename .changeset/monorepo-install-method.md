---
"@memberjunction/installer": patch
"@memberjunction/cli": patch
---

Switch installer from distribution bootstrap ZIP to full monorepo source download. The installer now downloads the complete MemberJunction repository via GitHub's codeload CDN (not rate-limited) instead of the smaller bootstrap distribution ZIP.
