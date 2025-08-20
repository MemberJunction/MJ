---
"@memberjunction/codegen-lib": patch
---

Fixed CodeGen Database Schema JSON generation errors caused by unescaped control characters

- Added comprehensive JSON string escaping function to handle all control characters (newlines, tabs, carriage returns, etc.)
- Fixed null reference errors when dbSchemaJSONOutput configuration is missing or incomplete
- Applied proper escaping to all string fields in JSON output (entity names, descriptions, field names, types, etc.)
- Ensures generated JSON files are valid and can be parsed without errors