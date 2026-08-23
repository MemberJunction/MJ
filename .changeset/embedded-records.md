---
"@memberjunction/core": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/core-entities": minor
---

Add Embedded Records: an opt-in 1:1 owner-held companion on BaseEntity so a record and the peer its FK points at (Deal.OrderID → Order) load, validate and persist as one unit — inverted save order, recursive companion serialization, CodeGen emission from EntityField.EmbeddedRecord.
