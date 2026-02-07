# MemberJunction Metadata Guidelines

## Critical Rules for Metadata Creation

### 1. NEVER Include System-Generated Fields
When creating or editing metadata JSON files, **NEVER** include the following fields - they are automatically managed by the MetadataSync tool:

- **primaryKey**: This object (containing ID or other key fields) is auto-generated
- **sync**: This object (containing lastModified and checksum) is auto-managed
- **__mj_CreatedAt**: System timestamp
- **__mj_UpdatedAt**: System timestamp
- **CreatedAt**: System timestamp
- **UpdatedAt**: System timestamp

These fields will be automatically added/updated when you run `mj sync push`.

### 2. File Naming Conventions
- **Metadata files**: Must match the filePattern in `.mj-sync.json` (typically `.*.json` for dot-prefixed files)
- **Configuration files**: Always start with dot (`.mj-sync.json`, `.mj-folder.json`)
- **Template files**: Use descriptive names with `.template.md` extension
- **Example output files**: Use `.example.json` extension

### 3. Agent Type Consistency
All agents in MemberJunction currently use the "Loop" agent type, which provides:
- Iterative task execution
- Decision-making about next steps
- Support for sub-agents and actions
- Structured JSON response format

### 4. Required Fields for Common Entities

#### AI Agents
- **Name**: Unique agent name
- **Description**: Clear description of agent's purpose
- **TypeID**: Use `@lookup:MJ: AI Agent Types.Name=Loop`
- **Status**: Typically "Active"
- **ExecutionOrder**: Integer for execution priority
- **ExposeAsAction**: Boolean for whether agent appears as an action

#### AI Agent Prompts
- **AgentID**: Use `@parent:ID` when nested under agent
- **PromptID**: Reference to prompt using `@lookup:`
- **ExecutionOrder**: Integer for prompt execution order
- **Status**: Typically "Active"

#### AI Agent Actions
- **AgentID**: Use `@parent:ID` when nested under agent
- **ActionID**: Reference to action using `@lookup:`
- **Status**: Typically "Active"

#### AI Prompts
- **Name**: Unique prompt name
- **Description**: Purpose of the prompt
- **TypeID**: Use `@lookup:AI Prompt Types.Name=Chat`
- **TemplateText**: Use `@file:` reference to template file
- **Status**: Typically "Active"
- **ResponseFormat**: Typically "JSON" for agent prompts
- **PromptRole**: "System" for agent system prompts
- **PromptPosition**: "First" for primary prompts

### 5. Template Variable Conventions
Agent prompt templates receive these standard variables:
- `{{ agentName }}`: The agent's name
- `{{ agentDescription }}`: The agent's description
- `{{ agentSpecificPrompt }}`: Content from the agent's specific prompt
- `{{ subAgentCount }}`: Number of available sub-agents
- `{{ subAgentDetails }}`: Formatted list of sub-agents
- `{{ actionCount }}`: Number of available actions
- `{{ actionDetails }}`: Formatted list of actions
- `{{ _OUTPUT_EXAMPLE }}`: The expected JSON response format

### 6. Prompt Template Best Practices
- Start with role definition
- List capabilities (sub-agents and actions)
- Provide clear instructions
- Include response format with examples
- Use the provided variables for dynamic content
- Keep specialization instructions in the agent-specific prompt

### 7. Using References

#### String Field References
- **@lookup**: For entity relationships
  - Single field: `@lookup:Actions.Name=Web Search`
  - Multi-field: `@lookup:AI Prompt Categories.Name=Actions&Status=Active`
  - With creation: `@lookup:Categories.Name=New Category?create&Description=Auto-created`
- **@file**: For external file content (e.g., `@file:templates/agent-prompt.md`)
- **@parent**: For parent entity fields in nested structures (e.g., `@parent:ID`)
- **@root**: For root entity fields in deeply nested structures

#### JSON Object Fields with References (POWERFUL!)

For fields that store JSON (like `Configuration`, `Settings`, `Metadata`), use **JSON objects** instead of stringified JSON. MetadataSync will:
1. Recursively process `@lookup:`, `@file:`, `@parent:` references inside the object
2. Resolve all references to actual UUIDs
3. Stringify the resolved object for database storage

**Example - Scheduled Job Configuration:**
```json
{
  "fields": {
    "Name": "Memory Manager Job",
    "Configuration": {
      "AgentID": "@lookup:AI Agents.Name=Memory Manager",
      "InitialMessage": "Analyze conversations",
      "Settings": {
        "MaxItems": 100,
        "TargetAgent": "@lookup:AI Agents.Name=Sage"
      }
    }
  }
}
```

**Benefits:**
- ✅ Human-readable: Use names, not UUIDs
- ✅ Maintainable: Entity name changes don't break references
- ✅ Nested: Works at any depth
- ✅ Type-safe: Structured in source, stringified for DB

**Before this feature, you had to write:**
```json
"Configuration": "{\"AgentID\":\"@lookup:AI Agents.Name=Memory Manager\"}"
```

**Now you write:**
```json
"Configuration": {
  "AgentID": "@lookup:AI Agents.Name=Memory Manager"
}
```

Much cleaner and the @lookup actually gets resolved!

### 8. Directory Structure Best Practices
```
metadata/
├── actions/           # Action definitions (usually pre-existing)
├── prompts/          # Prompt definitions
│   ├── templates/    # Prompt template files (.template.md)
│   └── output/       # Example output files (.example.json)
├── agent-types/      # Agent type definitions (usually pre-existing)
└── agents/           # Agent instances
```

### 9. Workflow for Creating New Agents
1. Create prompt templates in `prompts/templates/`
2. Create prompt records in `prompts/.prompts.json`
3. Create agent records in `agents/.agents.json` with related entities
4. Use `mj sync push` to sync to database
5. Test the agent through the MJ system

### 10. Common Pitfalls to Avoid
- Don't hardcode IDs - use @lookup references
- Don't include timestamp fields - they're auto-managed
- Don't forget to set Status fields to "Active"
- Don't create agent types - use existing "Loop" type
- Don't include primaryKey or sync objects in any records

### 11. Pushing Metadata with `mj sync push`

#### Command Syntax
Run from the **repository root** (not from inside `metadata/`):
```bash
# Push all metadata
npx mj sync push --dir=metadata

# Push only specific entity directories (use --include)
npx mj sync push --dir=metadata --include="prompts"

# Exclude problematic directories (use --exclude)
npx mj sync push --dir=metadata --exclude="api-application-scopes"

# Multiple patterns (comma-separated)
npx mj sync push --dir=metadata --include="prompts,agents"
```

**Important:**
- The CLI command is `mj sync` (space-separated). NOT `mj-sync` or `mjsync`.
- `--include` and `--exclude` cannot be used together — pick one.
- Patterns match on directory basename only (e.g., `"prompts"` matches `metadata/prompts/`).
- Validation errors in **any** entity directory cause a full rollback. Use `--include` to push only the directories you changed when other directories have pre-existing errors.

#### How `@file:` References Work
- `@file:` references are **resolved at push time** — the full file content is stored in the database, not the reference string.
- This means editing a template `.md` file requires a `mj sync push` to update the database. A server restart alone will NOT pick up template file changes.
- Template files referenced via `@file:` are convenience for version control — the database always holds the resolved content.

### 12. Testing and Validation
- Always run `mj sync push --dry-run` first to preview changes
- Check for lookup resolution errors
- Verify all @file references point to existing files
- Ensure all required fields are present

### 13. Agent Hierarchy Best Practices
- Top-level agents orchestrate workflows
- Sub-agents handle specialized tasks
- Actions are tools for specific operations
- Keep clear separation of concerns
- Document each agent's purpose clearly

## Remember
The metadata system is designed to be declarative and version-controlled. Let the MetadataSync tool handle all the system-level bookkeeping while you focus on defining the business logic and behavior of your agents.