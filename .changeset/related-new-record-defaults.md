---
"@memberjunction/core": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/codegen-lib": patch
---

Related-entity grids prefill every join field on a new child record and persist those defaults on the new-record URL (`/record/:entity/new?NewRecordValues=...`) so the link survives refresh and deeplink.

Left-nav related grids (including slot-mounted contributions) fill leftover column height and report their row-count badge: SetSectionRowCount upserts unknown section keys, contribution hosts are display:contents so they participate in the flex column, and accordion pixel heights are not applied while the rail is showing the panel.

Section search matches contribution titles (Orders) in both accordion and left-nav, keeps the rail visible when only one group hits, and does not treat chrome-hidden panels as non-matches.
