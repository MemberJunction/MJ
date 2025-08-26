---
"@memberjunction/core-entities": minor
"@memberjunction/ng-explorer-core": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
---

Added comprehensive tracking fields to AI execution entities:

- **AIAgentRun**: Added `RunName`, `Comment`, and `ParentID` fields for better run identification and hierarchical tracking
- **AIPromptRun**: Added `RunName`, `Comment`, and `ParentID` fields for consistent tracking across prompt executions
- **AIAgentRunStep**: Added `Comment` and `ParentID` fields for detailed step-level tracking

- **Flow Agent Type**: Added support for Chat message handling to properly bubble up messages from sub-agents to users
- **Action Execution**: Enhanced action execution logging by capturing input data (action name and parameters) in step entities
- **CodeGen SQL Execution**: Fixed QUOTED_IDENTIFIER issues by adding `-I` flag to sqlcmd execution (required for indexed views and computed columns)
- **MetadataSync Push Service**: Improved error reporting with detailed context for field processing failures, lookup failures, and save errors

- Database migration `V202508231445__v2.93.0` adds the new tracking fields with proper constraints and metadata
- Updated all generated entity classes, GraphQL types, and Angular forms to support the new fields
- Enhanced error diagnostics in push service to help identify root causes of sync failures
