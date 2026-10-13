---
"@memberjunction/installer": patch
---

Installer: the post-CodeGen artifact check now finds `mj_generatedentities` under `apps/MJAPI/node_modules` as well as the repo root. pnpm (the installer default) links workspace packages into each dependent and never creates the root entry, so a healthy install reported "Failed phase(s): codegen" (MemberJunction/MJ#4599, #4707).
