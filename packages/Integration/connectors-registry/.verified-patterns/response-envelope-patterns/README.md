# Response envelope patterns

Proven response-body envelope shapes that have been verified across ≥3 connectors.

Each entry captures:
- The envelope key path (`results`, `data`, `records`, `items`, etc.)
- The total-count path (when present)
- The has-more path (boolean) or termination signal
- The error-shape envelope (`{error:{code,message}}` vs `{errors:[{...}]}` vs `httpStatusOnly`)
- Applicable vendors (≥3 required)

Entries land in phase C.
