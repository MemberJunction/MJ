# Pagination patterns

Proven pagination shapes verified across ≥3 connectors.

Each entry captures:
- `PaginationType` (Cursor / Offset / PageNumber / LinkHeader / None)
- Vendor parameter names (`after`, `starting_after`, `page`, `offset`, etc.)
- Response paths (`paging.next.after`, `data[N].id`, `Link:` header parsing)
- Termination signal (`done=true`, `has_more=false`, absent `next` cursor, empty page)
- Applicable vendors (≥3 required)
- Reference extraction script

Entries land in phase C.
