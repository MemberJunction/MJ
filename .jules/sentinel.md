## 2024-05-18 - SQL Injection in createViewUserSearchSQL
**Vulnerability:** Found a SQL injection vulnerability in `createViewUserSearchSQL` inside `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts`. User input string was appended without escaping quotes.
**Learning:** Concatenating user inputs directly into a SQL search query logic leads to SQL Injection, especially when parsing string literals is not fully covered by regex validations.
**Prevention:** Escaped single quotes within the input via `.replace(/'/g, "''")` when handling query literals.
## 2024-05-18 - XSS bypass in regex-based sanitization
**Vulnerability:** A regex-based HTML sanitization function (`stripJavaScript`) in the markdown component was susceptible to XSS bypasses (e.g., using newlines in `java\nscript:`, encoded characters, unquoted attributes, and `xlink:href` on SVGs).
**Learning:** Regex is rarely sufficient for safely sanitizing HTML because it fails to understand DOM tree structure and browser parsing quirks (e.g., how browsers collapse whitespace or handle entities in attributes).
**Prevention:** Always use `DOMParser` to parse the HTML and recursively strip unsafe tags and attributes. Ensure control characters and whitespaces are stripped from attribute values before validation to prevent `java\nscript:` bypasses, and always check SVG-specific attributes like `xlink:href`.
