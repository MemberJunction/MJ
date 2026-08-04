---
'@memberjunction/standards': patch
---

ui-layers: stop flagging a manifest dependency declaration when it backs a
marker-excused import. Knip's dependency-check gate requires every real import
to be declared, so an `mj-ui-layers-allow`-excused import forces a declaration —
flagging that declaration put the two gates in deadlock (seen with
`@memberjunction/ng-shared` in `ng-file-storage`, tracked in MJ#3404). An
unexcused import of the same module still flags on its own line, and a
declaration with no excused import behind it still flags.
