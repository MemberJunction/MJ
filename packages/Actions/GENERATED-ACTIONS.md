# Generated Actions in MemberJunction

**📁 Example Metadata Files:** [/metadata/actions/__samples/](../../metadata/actions/__samples/) - Ready-to-use example action metadata files (excluded from sync by __ prefix)

## Table of Contents
1. [Overview](#overview)
2. [When to Use Generated Actions](#when-to-use-generated-actions)
3. [How It Works: The Two-Phase Process](#how-it-works-the-two-phase-process)
4. [Creating a Generated Action](#creating-a-generated-action)
5. [The Child Action Pattern](#the-child-action-pattern)
6. [Writing Effective UserPrompts](#writing-effective-userprompts)
7. [Code Review and Approval Workflow](#code-review-and-approval-workflow)
8. [Advanced Topics](#advanced-topics)
9. [Troubleshooting](#troubleshooting)
10. [Examples](#examples)

---

## Overview

MemberJunction includes a powerful AI-driven system that automatically generates action implementations from natural language descriptions. This capability enables rapid development of entity-specific actions, CRUD wrappers, and parameter mapping logic without writing TypeScript code manually.

### What Are Generated Actions?

Generated Actions are Action records with `Type='Generated'` that contain:
- A natural language **UserPrompt** describing desired functionality
- AI-generated **TypeScript code** stored in the database
- Auto-generated **parameters** and **result codes**
- Tracked **library dependencies**

### Key Benefits

1. **Rapid Development**: Describe what you want in plain English, get working code
2. **Consistency**: AI follows MemberJunction patterns and conventions
3. **Metadata-Driven**: Parameters and result codes automatically tracked in database
4. **Code Review**: Generated code stored in database for review before deployment
5. **Type Safety**: Generated actions are strongly-typed BaseAction subclasses
6. **Reusability**: Child action pattern creates entity-specific wrappers around generic operations

---

## When to Use Generated Actions

### ✅ Good Use Cases for Generated Actions

| Use Case | Example | Why Generated Works |
|----------|---------|---------------------|
| **Entity CRUD Wrappers** | "Create Conversation Record" action wrapping generic "Create Record" | Hardcodes entity name, provides entity-specific parameters, simpler workflow interface |
| **Parameter Mapping** | Map external API parameters to MJ entity fields | AI understands both schemas and generates transformation logic |
| **Simple Validation + CRUD** | Validate required fields before creating record | Straightforward validation rules, single entity operations |
| **Calculated Fields** | Derive field values from input parameters | Simple calculations, deterministic logic |
| **Data Retrieval** | Get specific entity records with filters | Wraps RunView with entity-specific parameters |

### ❌ When to Use Custom Actions Instead

| Scenario | Why Custom Is Better |
|----------|---------------------|
| **Complex Business Logic** | Multi-step workflows, state machines, conditional branching - requires careful design |
| **External Integrations** | Third-party APIs, webhooks, authentication flows - needs manual testing and error handling |
| **Stateful Operations** | Actions that maintain state across calls - AI struggles with state management patterns |
| **Performance-Critical Code** | Operations requiring specific optimization techniques - needs manual tuning |
| **Security-Sensitive Operations** | Authentication, authorization, encryption - requires expert review |

---

## How It Works: The Two-Phase Process

Understanding the architecture is key to using generated actions effectively.

### Phase 1: AI Code Generation (Design Time)

**Trigger**: Saving an Action record with:
- `Type = 'Generated'`
- `CodeLocked = false`
- `UserPrompt` field changed (or new record, or `ForceCodeGeneration = true`)

**Process**:
```
User saves Action record
    ↓
ActionEntityServerEntity.Save() detects generation conditions
    ↓
Calls GenerateCode() method
    ↓
Prepares prompt data:
  - UserPrompt
  - Complete entity schema (all entities and fields)
  - Available library documentation
  - Parent action info (if child action)
    ↓
Executes "Generate Action Code" AI prompt
    ↓
AI returns JSON:
  - code: TypeScript implementation
  - parameters: Action parameter definitions
  - resultCodes: Result code definitions
  - libraries: Used library references
    ↓
Validates generated code (syntax, structure)
    ↓
Saves to database (within transaction):
  - Action.Code = generated TypeScript
  - Action.CodeComments = AI explanation
  - Creates ActionParam records
  - Creates ActionResultCode records
  - Creates ActionLibrary records
    ↓
Transaction commits
```

**Key Point**: AI generation happens **once** when the Action record is saved, not on every build.

### Phase 2: Code Wrapping (Build Time)

**Trigger**: Running CodeGen (`npm run build` or explicit CodeGen execution)

**Process**:
```
CodeGen runs (packages/CodeGenLib)
    ↓
ActionSubClassGeneratorBase.generateActions()
    ↓
Loads Actions from database:
  - Type = 'Generated'
  - Status = 'Active'
  - CodeApprovalStatus = 'Approved'
    ↓
For each action:
  - Reads Action.Code from database
  - Wraps in BaseAction class template
  - Adds @RegisterClass decorator
  - Includes CodeComments as inline documentation
    ↓
Consolidates library imports
    ↓
Outputs action_subclasses.ts:
  - /packages/Actions/CoreActions/src/generated/ (core actions)
  - /packages/GeneratedActions/src/generated/ (non-core actions)
```

**Key Point**: CodeGen **does not** call AI. It just packages pre-generated code stored in the database.

### Separation of Concerns

| Phase | When | What | Why Separate |
|-------|------|------|--------------|
| **AI Generation** | Action record save | Generate TypeScript from UserPrompt | Enables code review, uses expensive AI resources sparingly |
| **Code Wrapping** | Build time | Package code in action class template | Fast, deterministic, no AI costs |
| **Runtime Execution** | Action invocation | Execute registered action class | Standard MJ action execution |

---

## Creating a Generated Action

### Step-by-Step Guide

#### 1. Create Action Record

Navigate to the Actions entity in MJ Explorer and create a new record:

**Required Fields**:
- **Name**: Descriptive action name (e.g., "Create Conversation Record")
- **Type**: Select **"Generated"**
- **Category**: Choose appropriate category or create custom
- **Status**: Set to **"Active"**
- **UserPrompt**: Natural language description of desired functionality
- **CodeApprovalStatus**: Initially set to **"Pending"** (or your workflow default)

**Optional Fields**:
- **ParentID**: Reference to parent action (enables child action pattern)
- **Description**: User-facing description of what the action does
- **UserComments**: Additional notes for the AI or reviewers
- **CodeLocked**: Set to `false` to allow generation (default)
- **ForceCodeGeneration**: Set to `true` to regenerate even if UserPrompt unchanged

#### 2. Write UserPrompt

The UserPrompt is your instruction to the AI. Be specific and clear.

**Example - Entity CRUD Wrapper**:
```
Create a record in the Conversations entity using parameters from this action and maps to the parent Create Record action and its format for parameters
```

**Example - Custom Logic**:
```
This action retrieves an AI Model Cost record by ID. It takes a single parameter 'ID' (the primary key). It validates that ID is provided, then calls the parent Get Record action with EntityName='MJ: AI Model Costs' and the provided ID. On success, it returns the record as 'ModelCostRecord'. Handle errors: ValidationError if ID missing, RecordNotFound if record doesn't exist, ParentActionFailed if parent action fails.
```

See [Writing Effective UserPrompts](#writing-effective-userprompts) section for patterns and best practices.

#### 3. Save the Record

When you click Save:
- **ActionEntityServerEntity.Save()** detects `Type='Generated'`
- AI code generation begins automatically
- Progress/errors shown in save operation feedback
- On success, generated code saved to `Action.Code` field

#### 4. Review Generated Code

After save completes, review the generated artifacts:

**In Action Record**:
- **Code**: Open the Code field to see generated TypeScript
- **CodeComments**: AI's explanation of the implementation

**In Related Entities**:
- **Action Params**: Navigate to related ActionParam records to see parameters
- **Action Result Codes**: View ActionResultCode records for result codes
- **Action Libraries**: Check ActionLibrary records for dependencies

#### 5. Test and Approve

**Testing**:
1. Set `CodeApprovalStatus = 'Approved'`
2. Run CodeGen: `npm run build` (from repo root)
3. Generated code appears in `action_subclasses.ts`
4. Test action execution through ActionEngine or workflows

**If Issues Found**:
1. Set `CodeApprovalStatus = 'Pending'` or 'Rejected'
2. Update `UserPrompt` with clarifications
3. Optionally set `ForceCodeGeneration = true`
4. Save to regenerate
5. Review again

#### 6. Lock Code (Optional)

Once satisfied with generated code:
- Set `CodeLocked = true` to prevent accidental regeneration
- Protects production actions from unintended changes

---

## The Child Action Pattern

One of the most powerful uses of generated actions is creating entity-specific wrappers around generic parent actions.

### ⚠️ Important: Composition, Not Inheritance

**Child actions do NOT inherit from their parent action classes.** Despite the name "child action," this is **not a TypeScript class inheritance relationship**. Instead, it's a **composition pattern** where:

- ✅ **Child action extends `BaseAction`** (always)
- ✅ **Child action calls parent action** via `ActionEngineServer.Instance.RunAction()` at runtime
- ✅ **ParentID is metadata-only** - stored in database, not in TypeScript code
- ❌ **Child action does NOT extend parent action class**

**Example of How It Actually Works:**
```typescript
// ✅ CORRECT - Generated child action code
@RegisterClass(BaseAction, "Create Conversation Record")
export class Create_Conversation_Record_Action extends BaseAction {
    //                                            ^^^^^^^^^^^^
    //                                    ALWAYS extends BaseAction

    protected override async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        // Extract child-specific parameters
        const userID = params.Params.find(p => p.Name === 'userid')?.Value;
        const type = params.Params.find(p => p.Name === 'type')?.Value;

        // Map to parent action's parameter format
        const mappedParams: ActionParam[] = [
            { Name: 'EntityName', Type: 'Input', Value: 'Conversations' },
            { Name: 'Fields', Type: 'Input', Value: { UserID: userID, Type: type, ... } }
        ];

        // Invoke parent action via ActionEngine (runtime composition, not inheritance)
        const parentAction = ActionEngineServer.Instance.Actions.find(a =>
            a.ID.trim().toLowerCase() === '2504e288-adf7-4913-a627-aa14276baa55'
        );
        const parentResult = await ActionEngineServer.Instance.RunAction({
            Action: parentAction,
            Params: mappedParams,
            ContextUser: params.ContextUser,
            Filters: []
        });

        // Handle parent result and return
        if (!parentResult.Success) {
            return { Success: false, ResultCode: 'ParentActionFailed', ... };
        }

        return { Success: true, ... };
    }
}

// ❌ WRONG - This is NOT how it works (no TypeScript inheritance)
export class Create_Conversation_Record_Action extends Create_Record_Action {
    // We DON'T do this - child doesn't extend parent class
}
```

**See Real Generated Code:**
- [CoreActions/src/generated/action_subclasses.ts:98-215](file:///Users/amith/Dropbox/develop/Mac/MJ/packages/Actions/CoreActions/src/generated/action_subclasses.ts#L98-L215) - Create Conversation Record (child action)
- [CoreActions/src/generated/action_subclasses.ts:218-317](file:///Users/amith/Dropbox/develop/Mac/MJ/packages/Actions/CoreActions/src/generated/action_subclasses.ts#L218-L317) - Get AI Model Cost (child action)

**Why Composition Over Inheritance?**

| Benefit | Explanation |
|---------|-------------|
| **Metadata-Driven** | Parent relationship stored in database (`ParentID` field), not hardcoded in TypeScript |
| **Flexibility** | Can change parent action in database without recompiling child action code |
| **Independence** | Child action is self-contained and works without parent's TypeScript code |
| **Clear Contracts** | Child defines its own parameters and explicitly maps to parent's format |
| **Runtime Discovery** | ActionEngine finds parent action by ID at runtime (fully dynamic) |
| **No Coupling** | Child doesn't depend on parent's internal implementation details |
| **Testability** | Can mock ActionEngine to test child action independently of parent |

### What Is a Child Action?

A **child action** is a generated action that:
1. References a **parent action** via `ParentID` field (database relationship)
2. Provides a **simpler, entity-specific interface**
3. **Maps parameters** from child → parent format at runtime
4. **Invokes parent** via `ActionEngineServer.Instance.RunAction()` (not via inheritance)
5. **Extracts outputs** from parent result
6. **Handles errors** from parent action

### Why Use Child Actions?

**Problem**: Generic actions like "Create Record" require:
```typescript
// Complex parameter structure
{
  EntityName: 'Conversations',  // Easy to mistype
  Fields: {
    UserID: '...',
    Type: '...',
    // ... all other fields
  }
}
```

**Solution**: Entity-specific child action provides:
```typescript
// Simple, typed parameters
{
  UserID: '...',
  Type: '...',
  Name: '...',
  // ... direct field parameters
}
```

### Benefits

1. **Type Safety**: Each entity field is a distinct parameter with proper type
2. **Discoverability**: Users see "Create Conversation Record" instead of generic "Create Record"
3. **Validation**: Entity-specific required field validation
4. **Simplified Workflows**: Workflow designers don't need to know EntityName
5. **Better Documentation**: Each child action documents entity-specific behavior

### Example: Create Record Pattern

#### Parent Action: "Create Record"

**Parameters**:
- `EntityName` (Input, String, Required): Name of entity to create
- `Fields` (Input, Object, Required): Object with field name → value mappings

**Returns**:
- `PrimaryKey` (Output, Object): Object with primary key field(s) and value(s)

#### Child Action: "Create Conversation Record"

**Generated from UserPrompt**:
```
Create a record in the Conversations entity using parameters from this action and maps to the parent Create Record action and its format for parameters
```

**Parameters** (auto-generated):
- `UserID` (Input, String, Required)
- `Type` (Input, String, Required)
- `Name` (Input, String, Optional)
- `Status` (Input, String, Optional)
- `Description` (Input, String, Optional)
- ... (all Conversations entity fields)
- `ConversationID` (Output, String): The created record ID

**Generated Code Pattern**:
```typescript
protected override async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    // 1. Extract child parameters
    const userID = params.Params.find(p => p.Name.toLowerCase() === 'userid')?.Value;
    const type = params.Params.find(p => p.Name.toLowerCase() === 'type')?.Value;
    // ... extract other fields

    // 2. Validate required fields
    if (!userID || !type) {
        return {
            Success: false,
            ResultCode: 'ValidationError',
            Message: 'UserID and Type are required fields to create a Conversation.'
        };
    }

    // 3. Map to parent action format
    const mappedParams: ActionParam[] = [
        {
            Name: 'EntityName',
            Type: 'Input',
            Value: 'Conversations'  // Hardcoded entity name
        },
        {
            Name: 'Fields',
            Type: 'Input',
            Value: {
                UserID: userID,
                Type: type,
                Name: name,
                // ... all fields
            }
        }
    ];

    // 4. Invoke parent action by ID
    const parentAction = ActionEngineServer.Instance.Actions.find(a =>
        a.ID.toLowerCase() === '2504e288-adf7-4913-a627-aa14276baa55'
    );
    const parentResult = await ActionEngineServer.Instance.RunAction({
        Action: parentAction,
        Params: mappedParams,
        ContextUser: params.ContextUser,
        Filters: []
    });

    // 5. Check parent result
    if (!parentResult.Success) {
        return {
            Success: false,
            ResultCode: 'ParentActionFailed',
            Message: 'Parent action failed: ' + parentResult.Message
        };
    }

    // 6. Extract output from parent
    const primaryKeyObj = parentResult.Params.find(p =>
        p.Name.toLowerCase() === 'primarykey'
    )?.Value;
    const conversationID = primaryKeyObj?.ID;

    if (!conversationID) {
        return {
            Success: false,
            ResultCode: 'MissingOutput',
            Message: 'Failed to retrieve created Conversation ID from parent action.'
        };
    }

    // 7. Add output parameter
    params.Params.push({
        Name: 'ConversationID',
        Type: 'Output',
        Value: conversationID
    });

    // 8. Return success
    return {
        Success: true,
        ResultCode: 'Success',
        Message: 'Conversation record created successfully.'
    };
}
```

### How AI Knows Parent Action Interface

When generating child actions, the system provides:
1. **Parent Action Metadata**: Name, Description, Category
2. **Parent Parameters**: Full list with types, descriptions, required flags
3. **Parent Result Codes**: Expected success/failure codes
4. **Entity Schema**: Complete field list with types and constraints

The AI uses this context to:
- Generate appropriate parameter mapping logic
- Extract correct output values from parent result
- Handle parent action error codes properly

### Common Parent Actions for Child Pattern

| Parent Action | Use For Child Actions | Example Child |
|---------------|----------------------|---------------|
| **Create Record** | Entity-specific record creation | Create Conversation Record, Create Template Record |
| **Get Record** | Entity-specific retrieval by ID | Get AI Model Cost, Get User Profile |
| **Update Record** | Entity-specific updates | Update Workflow State, Update Action Status |
| **Delete Record** | Entity-specific deletion | Delete Scheduled Job, Archive Conversation |
| **Query Records** | Entity-specific queries with filters | Query Active Users, Query Recent Runs |

---

## Writing Effective UserPrompts

The quality of generated code depends heavily on your UserPrompt. Here are proven patterns and best practices.

### Anatomy of a Good UserPrompt

**Components**:
1. **Action Purpose**: What the action does (1 sentence)
2. **Input Parameters**: What data it receives
3. **Processing Logic**: How it transforms/validates data
4. **Output**: What it returns
5. **Error Handling**: What error scenarios to handle

**Template**:
```
This action [PURPOSE]. It takes [INPUTS] as parameters. It [PROCESSING LOGIC]. On success, it returns [OUTPUTS]. Handle these errors: [ERROR SCENARIOS].
```

### Proven Patterns

#### Pattern 1: Simple Entity CRUD Wrapper (Minimal)

**When to use**: Standard CRUD operation with no special logic

**Format**:
```
[Create/Get/Update/Delete] a record in the [EntityName] entity using parameters from this action and maps to the parent [Parent Action Name] action and its format for parameters
```

**Examples**:
```
Create a record in the Conversations entity using parameters from this action and maps to the parent Create Record action and its format for parameters

Get a record from the AI Model Costs entity using parameters from this action and maps to the parent Get Record action and its format for parameters

Update a record in the Scheduled Jobs entity using parameters from this action and maps to the parent Update Record action and its format for parameters
```

**What AI Generates**:
- Extracts all entity fields as parameters
- Marks entity-required fields as action-required
- Maps to parent action format
- Extracts primary key from parent result
- Returns entity-specific output parameter

#### Pattern 2: Entity CRUD with Validation

**When to use**: Need custom validation beyond entity constraints

**Format**:
```
[Create/Update] a record in the [EntityName] entity. Validate that [VALIDATION RULES]. Use parameters from this action and map to the parent [Parent Action Name] action.
```

**Example**:
```
Create a record in the User entity. Validate that Email is a valid email format and Password is at least 8 characters. Use parameters from this action and map to the parent Create Record action.
```

**What AI Generates**:
- Custom validation logic before parent call
- ValidationError result codes for each validation rule
- Detailed error messages for validation failures

#### Pattern 3: Calculated Fields

**When to use**: Some fields should be computed from other parameters

**Format**:
```
[Create/Update] a record in the [EntityName] entity. Calculate [FIELD] as [CALCULATION]. Map to parent [Parent Action Name] action.
```

**Example**:
```
Create a record in the Invoice entity. Calculate TotalAmount as sum of LineItems amounts. Calculate TaxAmount as TotalAmount * TaxRate. Map to parent Create Record action.
```

**What AI Generates**:
- Calculation logic in pre-processing step
- Validation that input data is valid for calculations
- Calculated values added to Fields object for parent

#### Pattern 4: Conditional Logic

**When to use**: Behavior varies based on parameter values

**Format**:
```
[ACTION PURPOSE]. If [CONDITION], then [BEHAVIOR A]. Otherwise, [BEHAVIOR B]. Handle errors: [ERROR CASES].
```

**Example**:
```
Get user profile information. If IncludePrivateData is true, include email and phone fields. Otherwise, return only public profile fields (name, avatar, bio). Handle errors: UserNotFound if ID doesn't exist, PermissionDenied if requesting private data without authorization.
```

**What AI Generates**:
- Conditional branching logic
- Different RunView queries based on conditions
- Appropriate result codes for each scenario

#### Pattern 5: Data Aggregation

**When to use**: Combining data from multiple sources

**Format**:
```
[ACTION PURPOSE] by [METHOD]. Retrieve [DATA SOURCE 1], retrieve [DATA SOURCE 2], then combine into [OUTPUT FORMAT].
```

**Example**:
```
Get conversation summary by conversation ID. Retrieve the Conversation record, retrieve all related ConversationMessage records, then combine into a summary object with conversation metadata and message count.
```

**What AI Generates**:
- Multiple RunView calls
- Data merging logic
- Structured output object

### Best Practices

#### ✅ Do This

1. **Be Specific About Entity Names**
   - Use exact entity names: "Conversations" not "conversation table"
   - AI validates entity names against schema

2. **Reference Parent Actions Clearly**
   - Include parent action name in prompt
   - Set ParentID field in action record

3. **Specify Required vs Optional**
   - "UserID and Type are required, all other fields are optional"
   - AI marks parameters correctly

4. **Describe Error Scenarios**
   - List expected error cases
   - AI generates appropriate result codes

5. **Use MJ Terminology**
   - "Entity" not "table"
   - "RunView" not "query"
   - "ContextUser" not "current user"

6. **Keep It Focused**
   - One clear purpose per action
   - Break complex workflows into multiple actions

#### ❌ Avoid This

1. **Vague Descriptions**
   - Bad: "Create some data"
   - Good: "Create a record in the Conversations entity"

2. **Missing Error Handling**
   - Bad: "Create a user"
   - Good: "Create a user. Handle errors: ValidationError if email invalid, DuplicateError if email exists"

3. **Ambiguous Parameter Names**
   - Bad: "Takes an ID"
   - Good: "Takes ConversationID (the primary key of the Conversation record)"

4. **Complex Multi-Step Logic**
   - Bad: "Create user, send email, wait for confirmation, update status"
   - Good: Use multiple actions or write custom action

5. **External Dependencies**
   - Bad: "Call the SendGrid API to send an email"
   - Good: "Use the Send Email action to send notification"

### Testing Your UserPrompt

After generation, check:

1. **Parameter List**: Are all expected parameters generated?
2. **Required Flags**: Are required parameters marked correctly?
3. **Result Codes**: Are all error scenarios covered?
4. **Code Quality**: Is the generated code clean and understandable?

If issues found, refine UserPrompt and regenerate (set `ForceCodeGeneration=true`).

---

## Code Review and Approval Workflow

Generated code should be reviewed before deployment to production.

### The Review Process

#### 1. Generation Phase

**Status**: `CodeApprovalStatus = 'Pending'`

Action record saved with UserPrompt:
- AI generates code automatically
- Code stored in `Action.Code` field
- Parameters and result codes created in database

#### 2. Initial Review

**Reviewer checks**:
- Open `Action.Code` field to read generated TypeScript
- Review `CodeComments` for AI's explanation
- Check `Action Params` for parameter definitions
- Check `Action Result Codes` for error handling
- Verify `Action Libraries` for dependencies

**Common Issues to Check**:
- Correct entity names (including "MJ: " prefix where needed)
- Proper required field validation
- Correct parent action ID (if child action)
- Appropriate error messages
- Efficient data access patterns (no N+1 queries)

#### 3. Testing Phase

**Status**: `CodeApprovalStatus = 'Testing'` (or keep 'Pending')

1. Set `CodeApprovalStatus = 'Approved'` temporarily
2. Run CodeGen: `npm run build`
3. Test action execution:
   - Via ActionEngine in code
   - Via MJ Explorer (if UI exists)
   - Via workflows
4. Test all error scenarios
5. Check logs for issues

#### 4. Approval or Rejection

**If Approved**:
- Set `CodeApprovalStatus = 'Approved'`
- Optionally set `CodeLocked = true` to prevent changes
- Code included in next build

**If Rejected**:
- Set `CodeApprovalStatus = 'Rejected'`
- Add notes to `UserComments` explaining issues
- Update `UserPrompt` to address issues
- Set `ForceCodeGeneration = true`
- Save to regenerate

#### 5. Production Deployment

**Status**: `CodeApprovalStatus = 'Approved'`, `CodeLocked = true`

- Action included in production builds
- Code cannot be regenerated accidentally
- To update: must unlock, regenerate, review, re-approve

### Approval Status Values

| Status | Meaning | Included in Build | Can Regenerate |
|--------|---------|-------------------|----------------|
| **Pending** | Awaiting review | No | Yes |
| **Testing** | Under test | No (unless forced) | Yes |
| **Approved** | Approved for production | **Yes** | Only if unlocked |
| **Rejected** | Failed review | No | Yes |

### Review Checklist

**Functionality**:
- [ ] Code implements UserPrompt requirements
- [ ] All parameters needed for functionality present
- [ ] Required parameters properly marked
- [ ] All error scenarios handled

**MJ Conventions**:
- [ ] Uses MJ classes (Metadata, RunView, BaseAction)
- [ ] Follows MJ naming conventions
- [ ] Proper entity names (with "MJ: " prefix where needed)
- [ ] Uses ContextUser for server-side operations

**Code Quality**:
- [ ] Clean, readable TypeScript
- [ ] No `any` types
- [ ] Proper error messages
- [ ] No obvious performance issues
- [ ] Follows functional decomposition (no overly long functions)

**Security**:
- [ ] No hardcoded credentials
- [ ] Proper authorization checks
- [ ] No SQL injection vulnerabilities
- [ ] Sensitive data handled appropriately

---

## Advanced Topics

### Regenerating Actions

**Scenarios requiring regeneration**:
1. UserPrompt needs refinement
2. Entity schema changed (new fields)
3. Parent action interface changed
4. AI models improved (want better code)

**How to regenerate**:
1. Set `CodeLocked = false` (if locked)
2. Update `UserPrompt` (if needed)
3. Set `ForceCodeGeneration = true`
4. Save action record
5. AI generates new code
6. Review and approve again

**Note**: Regeneration replaces existing code completely. Any manual edits to generated code will be lost.

### Understanding the AI Prompt Template

The AI prompt that generates actions is defined in:
`/metadata/prompts/templates/system/action-generation.template.md`

**Prompt receives**:
```typescript
{
  userPrompt: "Your UserPrompt text",
  entityInfo: [
    {
      Name: "EntityName",
      Description: "Entity description",
      Fields: [
        {
          Name: "FieldName",
          NeedsQuotes: true/false,
          ReadOnly: true/false,
          AllowsNull: true/false
        }
      ]
    }
  ],
  availableLibraries: {
    "LibraryName": {
      Items: [
        { Name: "ItemName", Content: "Documentation HTML" }
      ]
    }
  },
  IsChildAction: true/false,
  parentAction: {
    Name: "Parent Action Name",
    Description: "...",
    Parameters: [...]
  }
}
```

**Prompt returns** (JSON):
```typescript
{
  code: "// TypeScript code for InternalRunAction method body only",
  explanation: "Clear explanation of implementation",
  parameters: [
    {
      Name: "ParameterName",
      Type: "Input" | "Output" | "Both",
      ValueType: "Scalar" | "Simple Object" | "BaseEntity Sub-Class" | "Other",
      IsArray: false,
      IsRequired: true,
      DefaultValue: null,
      Description: "Parameter description"
    }
  ],
  resultCodes: [
    {
      ResultCode: "Success",
      IsSuccess: true,
      Description: "Description of this result"
    }
  ],
  libraries: [
    {
      LibraryName: "@memberjunction/core",
      ItemsUsed: ["Metadata", "RunView"]
    }
  ]
}
```

**Understanding the prompt helps you**:
- Write better UserPrompts (you know what context AI has)
- Debug generation issues (understand AI's constraints)
- Predict what code will be generated

### Manual Code Edits

**When to manually edit generated code**:
- Never (or rarely)

**Why not**:
- Regeneration overwrites manual edits
- Generated code should come from better UserPrompt, not manual fixes

**If you must edit**:
1. Copy action to new Custom action
2. Set `Type = 'Custom'`
3. Move code to `/custom/` directory
4. Edit freely (won't be overwritten)

**Better approach**:
1. Refine UserPrompt to generate correct code
2. Regenerate with better prompt
3. Keep action as Generated type

### Library Management

Generated actions can use any MJ library. The system tracks dependencies.

**Available libraries**:
- `@memberjunction/core`: Metadata, RunView, RunQuery
- `@memberjunction/actions`: ActionEngineServer
- `@memberjunction/ai`: AIEngine classes
- `@memberjunction/communication`: EmailEngine
- Others documented in Library entity

**How AI chooses libraries**:
- Prompt template includes library documentation
- AI selects appropriate libraries for UserPrompt requirements
- Library usage tracked in ActionLibrary records

**Import consolidation**:
- CodeGen merges imports across all actions
- Single import statement per library
- Only used items imported

### Performance Considerations

**Generated actions should**:
- Use RunViews (plural) for batch queries
- Avoid loops with RunView calls
- Use client-side aggregation where possible
- Load data once, process in memory

**If generated code is inefficient**:
- Refine UserPrompt with performance hints
- Example: "Use a single RunViews call to load all data, then aggregate client-side"
- Or write Custom action with optimized logic

### Versioning and Change Management

**Action record changes**:
- Use Record Changes entity (built-in MJ versioning)
- All changes tracked automatically
- Can view historical code versions

**Migration strategy**:
1. Create new version of action (copy record)
2. Update UserPrompt in new version
3. Test new version thoroughly
4. Update workflows to use new version
5. Archive old version

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: "Action not yet implemented" Error

**Cause**: Action has `Type='Generated'` but no code generated yet

**Solution**:
1. Check `Action.Code` field - is it empty?
2. Check save operation logs for generation errors
3. Verify `UserPrompt` is clear and specific
4. Try saving action again (regenerates code)

#### Issue: Generated Code Has Wrong Entity Name

**Cause**: UserPrompt used informal entity name or AI misunderstood

**Solution**:
1. Check exact entity name in `/packages/MJCoreEntities/src/generated/entity_subclasses.ts`
2. Update UserPrompt with exact name (including "MJ: " prefix if needed)
3. Example: "MJ: AI Model Costs" not "AI Model Costs"
4. Set `ForceCodeGeneration=true` and save

#### Issue: Parameters Not Generated

**Cause**: UserPrompt didn't clearly specify parameters

**Solution**:
1. Update UserPrompt to explicitly mention parameters
2. Example: "Takes UserID and Type as required parameters, Name and Description as optional"
3. Regenerate

#### Issue: Parent Action Call Fails

**Cause**: Parent action ID not found or parameters in wrong format

**Solution**:
1. Verify `ParentID` field is set correctly
2. Check parent action still exists and is Active
3. Review parent action's parameter format
4. Update UserPrompt with correct parameter mapping
5. Regenerate

#### Issue: Generated Code Has TypeScript Errors

**Cause**: AI generated invalid syntax or used non-existent types

**Solution**:
1. Review TypeScript errors in `Action.Code`
2. Check if entity names are valid
3. Verify library imports are correct
4. Refine UserPrompt with more specificity
5. Consider using Custom action if issue persists

#### Issue: Code Not Appearing in Build

**Cause**: `CodeApprovalStatus` not set to 'Approved' or `Status` not 'Active'

**Solution**:
1. Check `Status` field = 'Active'
2. Check `CodeApprovalStatus` field = 'Approved'
3. Run `npm run build` from repo root
4. Check `/packages/Actions/CoreActions/src/generated/action_subclasses.ts`

#### Issue: Action Regenerates Unexpectedly

**Cause**: `CodeLocked = false` and UserPrompt or related field changed

**Solution**:
1. Set `CodeLocked = true` to prevent regeneration
2. Only unlock when you want to regenerate

#### Issue: Generated Code Is Inefficient

**Cause**: AI doesn't know performance requirements or patterns

**Solution**:
1. Add performance hints to UserPrompt
2. Example: "Use a single RunViews call to batch load all data"
3. Or convert to Custom action for manual optimization

---

## Examples

### Example 1: Simple CRUD Wrapper

**Goal**: Create action to create Conversation records without specifying EntityName

**Action Record**:
```yaml
Name: Create Conversation Record
Type: Generated
Category: Custom
Status: Active
ParentID: 2504E288-ADF7-4913-A627-AA14276BAA55  # Create Record action
UserPrompt: Create a record in the Conversations entity using parameters from this action and maps to the parent Create Record action and its format for parameters
CodeApprovalStatus: Approved
```

**Generated Parameters**:
- UserID (Input, String, Required)
- Type (Input, String, Required)
- Name (Input, String, Optional)
- Status (Input, String, Optional)
- Description (Input, String, Optional)
- ExternalID (Input, String, Optional)
- LinkedEntityID (Input, String, Optional)
- LinkedRecordID (Input, String, Optional)
- DataContextID (Input, String, Optional)
- IsArchived (Input, Boolean, Optional)
- ConversationID (Output, String)

**Generated Result Codes**:
- Success (IsSuccess: true)
- ValidationError (IsSuccess: false)
- ParentActionFailed (IsSuccess: false)
- ParentActionError (IsSuccess: false)
- MissingOutput (IsSuccess: false)

**Usage**:
```typescript
const result = await ActionEngineServer.Instance.RunAction({
    Action: createConversationAction,
    Params: [
        { Name: 'UserID', Type: 'Input', Value: 'user-guid' },
        { Name: 'Type', Type: 'Input', Value: 'chat' },
        { Name: 'Name', Type: 'Input', Value: 'My Conversation' }
    ],
    ContextUser: contextUser,
    Filters: []
});

if (result.Success) {
    const conversationID = result.Params.find(p => p.Name === 'ConversationID')?.Value;
    console.log('Created conversation:', conversationID);
}
```

### Example 2: Retrieval with Validation

**Goal**: Get AI Model Cost by ID with proper error handling

**Action Record**:
```yaml
Name: Get AI Model Cost
Type: Generated
Category: AI
Status: Active
ParentID: 49E30665-1A90-45CA-9129-C33959A51B4F  # Get Record action
UserPrompt: Get an AI Model Cost record from the database using parameters from this action and maps to the parent Get Record action and its format for parameters
CodeApprovalStatus: Approved
```

**Generated Parameters**:
- ID (Input, String, Required)
- ModelCostRecord (Output, Object)

**Generated Result Codes**:
- Success (IsSuccess: true)
- ValidationError (IsSuccess: false) - ID missing
- RecordNotFound (IsSuccess: false) - ID doesn't exist
- ParentActionFailed (IsSuccess: false) - parent action error

**Usage**:
```typescript
const result = await ActionEngineServer.Instance.RunAction({
    Action: getModelCostAction,
    Params: [
        { Name: 'ID', Type: 'Input', Value: 'cost-record-guid' }
    ],
    ContextUser: contextUser,
    Filters: []
});

if (result.Success) {
    const record = result.Params.find(p => p.Name === 'ModelCostRecord')?.Value;
    console.log('Model cost:', record);
} else {
    console.error('Error:', result.ResultCode, result.Message);
}
```

### Example 3: Custom Validation Logic

**Goal**: Create user with email validation

**Action Record**:
```yaml
Name: Create User with Validation
Type: Generated
Category: Users
Status: Active
ParentID: 2504E288-ADF7-4913-A627-AA14276BAA55  # Create Record action
UserPrompt: |
  Create a record in the Users entity. Before creating:
  1. Validate that Email is in valid email format (contains @ and .)
  2. Validate that Password is at least 8 characters
  3. If validation fails, return ValidationError with specific message
  Map to parent Create Record action and return new UserID on success.
CodeApprovalStatus: Approved
```

**Generated Code Pattern**:
```typescript
// 1. Extract parameters
const email = params.Params.find(p => p.Name.toLowerCase() === 'email')?.Value;
const password = params.Params.find(p => p.Name.toLowerCase() === 'password')?.Value;

// 2. Validate email format
if (!email || !email.includes('@') || !email.includes('.')) {
    return {
        Success: false,
        ResultCode: 'ValidationError',
        Message: 'Email must be in valid format (contain @ and .)'
    };
}

// 3. Validate password length
if (!password || password.length < 8) {
    return {
        Success: false,
        ResultCode: 'ValidationError',
        Message: 'Password must be at least 8 characters'
    };
}

// 4. Map to parent action
// ... create record logic
```

### Example 4: Calculated Fields

**Goal**: Create invoice with calculated totals

**Action Record**:
```yaml
Name: Create Invoice with Totals
Type: Generated
Category: Finance
Status: Active
ParentID: 2504E288-ADF7-4913-A627-AA14276BAA55  # Create Record action
UserPrompt: |
  Create a record in the Invoices entity. Calculate:
  - Subtotal: sum of all LineItems amounts
  - TaxAmount: Subtotal * TaxRate
  - TotalAmount: Subtotal + TaxAmount
  Takes CustomerID (required), LineItems (array of {description, amount}), and TaxRate (default 0.1).
  Map to parent Create Record action.
CodeApprovalStatus: Approved
```

**Generated Code Pattern**:
```typescript
// 1. Extract parameters
const customerID = params.Params.find(p => p.Name.toLowerCase() === 'customerid')?.Value;
const lineItems = params.Params.find(p => p.Name.toLowerCase() === 'lineitems')?.Value;
const taxRate = params.Params.find(p => p.Name.toLowerCase() === 'taxrate')?.Value || 0.1;

// 2. Calculate subtotal
const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

// 3. Calculate tax and total
const taxAmount = subtotal * taxRate;
const totalAmount = subtotal + taxAmount;

// 4. Map to parent with calculated fields
const mappedParams: ActionParam[] = [
    { Name: 'EntityName', Type: 'Input', Value: 'Invoices' },
    {
        Name: 'Fields',
        Type: 'Input',
        Value: {
            CustomerID: customerID,
            Subtotal: subtotal,
            TaxAmount: taxAmount,
            TotalAmount: totalAmount,
            LineItems: JSON.stringify(lineItems)
        }
    }
];
// ... invoke parent
```

### Example 5: Conditional Logic

**Goal**: Get user profile with optional private data

**Action Record**:
```yaml
Name: Get User Profile
Type: Generated
Category: Users
Status: Active
UserPrompt: |
  Get user profile information by UserID. If IncludePrivateData is true, retrieve all user fields including Email and Phone. If false, retrieve only public fields (Name, Avatar, Bio). Return as UserProfile object. Handle errors: UserNotFound if ID doesn't exist.
CodeApprovalStatus: Approved
```

**Generated Code Pattern**:
```typescript
// 1. Extract parameters
const userID = params.Params.find(p => p.Name.toLowerCase() === 'userid')?.Value;
const includePrivate = params.Params.find(p => p.Name.toLowerCase() === 'includeprivatedata')?.Value || false;

// 2. Build field list based on flag
const fields = includePrivate
    ? 'ID, Name, Email, Phone, Avatar, Bio'
    : 'ID, Name, Avatar, Bio';

// 3. Query with appropriate fields
const rv = new RunView();
const result = await rv.RunView({
    EntityName: 'Users',
    ExtraFilter: `ID='${userID}'`,
    ResultType: 'entity_object'
}, params.ContextUser);

// 4. Check result
if (!result.Success || result.Results.length === 0) {
    return {
        Success: false,
        ResultCode: 'UserNotFound',
        Message: `User with ID ${userID} not found`
    };
}

// 5. Return profile
params.Params.push({
    Name: 'UserProfile',
    Type: 'Output',
    Value: result.Results[0]
});

return { Success: true, ResultCode: 'Success', Message: 'User profile retrieved' };
```

---

## Summary

Generated Actions provide a powerful way to rapidly create entity-specific actions using natural language descriptions. Key takeaways:

1. **Two-Phase Process**: AI generation (on save) + Code wrapping (on build)
2. **Child Action Pattern**: Create entity-specific wrappers around generic parent actions
3. **Clear UserPrompts**: Be specific about entities, parameters, and error handling
4. **Code Review**: Always review generated code before production deployment
5. **When to Use**: CRUD wrappers, parameter mapping, simple validation
6. **When Not to Use**: Complex logic, external integrations, performance-critical code

For questions or issues, consult:
- [CLAUDE.md](./CLAUDE.md) - General action development guidelines
- [Action development guidelines](./CLAUDE.md#actions-design-philosophy) - When to use actions vs direct code
- `/metadata/prompts/templates/system/action-generation.template.md` - The AI prompt template
- `/packages/MJCoreEntitiesServer/src/custom/ActionEntity.server.ts` - Generation implementation
