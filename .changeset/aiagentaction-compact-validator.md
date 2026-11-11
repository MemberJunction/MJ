---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
---

`MJ: AI Agent Actions` rows can be saved with `ResultExpirationMode = 'Compact'` again. The generated validator for `CK_AIAgentAction_CompactSettingsOnlyWhenCompact` enforced the opposite of the constraint (compact settings had to be empty on a Compact row), so with the Compact-requires-CompactMode check every Compact row failed one or the other. A migration corrects the stored GeneratedCode row, and the regenerated `ValidateCompactSettingsOnlyWhenResultExpirationModeIsCompact` rejects compact settings only when the mode is not Compact (MJ#6421).
