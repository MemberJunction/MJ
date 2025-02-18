---
"@memberjunction/codegen-lib": patch
---

Mark optional input fields as nullable for graphql.

This adds the `nullable: true` flag for the type-graphql decorators on optional input type fields. 
This allows the field to be `null` or undefined. If not defined, it will not be updated. If defined as 
`null`, then it should set the value of the column to `NULL` (provided that's permitted for the column).
