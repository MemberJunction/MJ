## 2024-05-18 - SQL Injection in createViewUserSearchSQL
**Vulnerability:** Found a SQL injection vulnerability in `createViewUserSearchSQL` inside `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts`. User input string was appended without escaping quotes.
**Learning:** Concatenating user inputs directly into a SQL search query logic leads to SQL Injection, especially when parsing string literals is not fully covered by regex validations.
**Prevention:** Escaped single quotes within the input via `.replace(/'/g, "''")` when handling query literals.
