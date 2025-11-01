# Generated Action Examples

**⚠️ IMPORTANT: These are examples only, NOT synced to database**

This directory contains example Action metadata files demonstrating common patterns for AI-generated actions.

All example files are prefixed with `__` (double underscore) which **excludes them from MetadataSync operations**. These are **reference examples only** - copy and modify them for your own use, but they won't be automatically synced to your database.

## How to Use These Examples

1. **Review the examples** to understand UserPrompt patterns
2. **Copy and modify** for your own entity-specific actions
3. **Remove the `__` prefix** from the filename when you want to sync your version
4. **Import into MJ** via MetadataSync or manual creation
5. **Test and refine** the generated code

## Example Categories

### 1. Simple CRUD Wrappers
- **__create-conversation-record.json**: Entity-specific create wrapper
- **__get-ai-model-cost.json**: Entity-specific retrieval by ID

### 2. Validation + CRUD
- **__create-user-with-validation.json**: Custom validation before create

### 3. Calculated Fields
- **__create-invoice-with-totals.json**: Computed field values

### 4. Conditional Logic
- **__get-user-profile-conditional.json**: Different outputs based on parameters

### 5. Data Aggregation
- **__get-conversation-summary.json**: Combining data from multiple entities

## Key Patterns

### Pattern 1: Simple Entity CRUD Wrapper

**UserPrompt Format:**
```
[Create/Get/Update/Delete] a record in the [EntityName] entity using parameters from this action and maps to the parent [Parent Action Name] action and its format for parameters
```

**Example:**
```json
{
  "Name": "Create Conversation Record",
  "Type": "Generated",
  "ParentID": "2504E288-ADF7-4913-A627-AA14276BAA55",
  "UserPrompt": "Create a record in the Conversations entity using parameters from this action and maps to the parent Create Record action and its format for parameters"
}
```

### Pattern 2: Validation + CRUD

**UserPrompt Format:**
```
[Create/Update] a record in the [EntityName] entity. Validate that [VALIDATION_RULES]. Use parameters from this action and map to the parent [Parent Action Name] action.
```

**Example:**
```json
{
  "UserPrompt": "Create a record in the Users entity. Validate that Email is in valid email format and Password is at least 8 characters. Use parameters from this action and map to the parent Create Record action."
}
```

### Pattern 3: Calculated Fields

**UserPrompt Format:**
```
[Create/Update] a record in the [EntityName] entity. Calculate [FIELD_NAME] as [CALCULATION]. Map to parent [Parent Action Name] action.
```

**Example:**
```json
{
  "UserPrompt": "Create a record in the Invoices entity. Calculate Subtotal as sum of LineItems amounts. Calculate TaxAmount as Subtotal * TaxRate. Calculate TotalAmount as Subtotal + TaxAmount. Map to parent Create Record action."
}
```

## Common Parent Actions

| Parent Action ID | Name | Use For |
|------------------|------|---------|
| `2504E288-ADF7-4913-A627-AA14276BAA55` | Create Record | Entity-specific create operations |
| `49E30665-1A90-45CA-9129-C33959A51B4F` | Get Record | Entity-specific retrieval by ID |
| `[Update Record ID]` | Update Record | Entity-specific updates |
| `[Delete Record ID]` | Delete Record | Entity-specific deletions |
| `[Query Records ID]` | Query Records | Entity-specific queries |

## Best Practices

1. **Be Specific**: Use exact entity names from the database schema
2. **List Requirements**: Explicitly state required vs optional parameters
3. **Define Errors**: Describe expected error scenarios
4. **Keep Focused**: One clear purpose per action
5. **Reference Parent**: Always mention parent action name in UserPrompt

## Testing Your Generated Action

After creation:

1. **Review Code**: Check `Action.Code` field for generated TypeScript
2. **Check Parameters**: Verify `ActionParam` records are correct
3. **Review Result Codes**: Ensure `ActionResultCode` records cover all scenarios
4. **Approve**: Set `CodeApprovalStatus='Approved'`
5. **Build**: Run `npm run build` to generate TypeScript files
6. **Test**: Execute action via ActionEngine or workflows
7. **Lock**: Set `CodeLocked=true` when finalized

## Troubleshooting

**Issue: Wrong Entity Name**
- Check exact name in `/packages/MJCoreEntities/src/generated/entity_subclasses.ts`
- Newer entities use "MJ: " prefix (e.g., "MJ: AI Model Costs")

**Issue: Missing Parameters**
- Update UserPrompt to explicitly list expected parameters
- Regenerate by setting `ForceCodeGeneration=true`

**Issue: Validation Not Working**
- Add validation rules to UserPrompt
- Example: "Validate that Email is valid format"

## More Information

See [/packages/Actions/GENERATED-ACTIONS.md](../../../packages/Actions/GENERATED-ACTIONS.md) for comprehensive documentation.
