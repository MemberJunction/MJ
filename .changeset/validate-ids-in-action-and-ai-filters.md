---
"@memberjunction/core": patch
"@memberjunction/ai-mcp-client": patch
"@memberjunction/ai-agent-manager": patch
"@memberjunction/actions": patch
"@memberjunction/scheduling-actions": patch
"@memberjunction/scheduling-engine": patch
"@memberjunction/clustering-engine": patch
"@memberjunction/tag-engine": patch
"@memberjunction/core-actions": patch
---

Server code now validates caller values before it puts them into RunView filters. MCP connection IDs, agent spec IDs, entity action list IDs, scheduling and list action IDs, cluster analysis document and entity IDs, merge tag IDs and seed taxonomy source IDs must be UUIDs. A watched entity filter of a user routine and the cluster analysis Filter must pass the data provider's client clause screen for the acting user before they run. These paths no longer return data provider error text to the caller.

RunView refuses a ViewID that is not a UUID when it looks up the entity of a view, and escapes a ViewName in that lookup.

The Add Records to List, Remove Records from List, Update List Item Status, Get List Records and Get Record List Membership actions refuse a ListID, EntityID or UserID that is not a UUID, and escape record IDs, status values and entity names in their filters.
