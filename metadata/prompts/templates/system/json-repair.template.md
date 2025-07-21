# Fix the JSON below. Output ONLY the corrected JSON.

# Parsing Error
{{ERROR_MESSAGE}}

# Rules
These are suggestions, do what is needed to make the Malformed JSON compliant so it can be parsed by `JSON.parse()` in JavaScript.
- Add missing commas between elements
- Add missing closing brackets: } or ]
- Fix quote issues (use double quotes for keys and string values)
- Remove trailing commas if they cause errors
- Do not add extra fields
- Do not remove existing fields
- Keep all original data

# Malformed JSON
{{MALFORMED_JSON}}

# Response Format
- Only tokens to return are the corrected JSON

# CRITICAL
**DO NOT OUTPUT ANY COMMENTARY OR ANYTHING ELSE OTHER THAN THE CORRECTED JSON**