# Agent Profiles Design Proposal

## Overview

Agent Profiles provide a mechanism to define sets of variables/parameters that can be applied to an agent at runtime. This enables the same agent to behave differently based on the selected profile, without requiring code changes or agent duplication.

### Use Cases

- **Multi-subsidiary Operations**: Running a Marketing Agent with different configurations for each subsidiary within a complex corporation
- **Department-specific Behavior**: Adapting agent behavior for different departments (HR, Finance, Sales)
- **Regional Variations**: Adjusting for different geographic regions with varying regulations, currencies, and languages
- **Customer-specific Customizations**: Providing tailored behavior without duplicating agents
- **Environment-specific Settings**: Different configurations for development, staging, and production

## Current State Analysis

### Existing Variable System

The current MemberJunction AI Agent system supports variables through:

1. **`data` Parameter**: `ExecuteAgentParams` includes an optional `data?: Record<string, any>` field
2. **Template Variables**: Variables are passed to prompts for template substitution using handlebars-style syntax (`{{ variableName }}`)
3. **Variable Propagation**: Parent agent data is passed to sub-agents, with parent data overriding sub-agent parameters
4. **Context Data**: Agent execution context (agent name, sub-agents, actions) is automatically included

### Limitations

- No persistent storage for variable sets
- No user or company-specific variable resolution
- No secure handling of sensitive variables (API keys, tokens)
- No UI for managing variable configurations
- No versioning or audit trail for variable changes

## Proposed Schema Design

### 1. AIAgentProfile Entity

Core profile definition that groups related variables:

```sql
CREATE TABLE AIAgentProfile (
    ID uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentID uniqueidentifier NOT NULL,         -- FK to AIAgent
    Name nvarchar(100) NOT NULL,               -- e.g., "North America Division"
    Description nvarchar(MAX) NULL,
    IsActive bit NOT NULL DEFAULT 1,
    IsDefault bit NOT NULL DEFAULT 0,          -- One default per agent
    Priority int NOT NULL DEFAULT 0,           -- For ordering in UI
    CompanyID uniqueidentifier NULL,           -- FK for company-specific profiles
    UserID uniqueidentifier NULL,              -- FK for user-specific profiles
    Tags nvarchar(MAX) NULL,                   -- JSON array for categorization
    ExpirationDate datetime NULL,              -- For temporary profiles
    __mj_CreatedAt datetime NOT NULL DEFAULT GETDATE(),
    __mj_UpdatedAt datetime NOT NULL DEFAULT GETDATE(),
    __mj_DeletedAt datetime NULL,
    CONSTRAINT PK_AIAgentProfile PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentProfile_Agent FOREIGN KEY (AgentID) REFERENCES AIAgent(ID),
    CONSTRAINT FK_AIAgentProfile_Company FOREIGN KEY (CompanyID) REFERENCES Company(ID),
    CONSTRAINT FK_AIAgentProfile_User FOREIGN KEY (UserID) REFERENCES [User](ID)
)
```

### 2. AIAgentProfileParam Entity

Individual parameters/variables within a profile:

```sql
CREATE TABLE AIAgentProfileParam (
    ID uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID(),
    ProfileID uniqueidentifier NOT NULL,       -- FK to AIAgentProfile
    Name nvarchar(100) NOT NULL,               -- Variable name
    Value nvarchar(MAX) NULL,                  -- Value (stored as string, parsed by type)
    Type nvarchar(50) NOT NULL,                -- 'string', 'number', 'boolean', 'json', 'secure'
    IsEncrypted bit NOT NULL DEFAULT 0,        -- For sensitive values
    Description nvarchar(MAX) NULL,
    ValidationRule nvarchar(MAX) NULL,         -- Optional JSON validation schema
    Source nvarchar(50) NOT NULL DEFAULT 'manual', -- 'manual', 'integration', 'computed'
    SourceMetadata nvarchar(MAX) NULL,         -- JSON for integration lookups
    __mj_CreatedAt datetime NOT NULL DEFAULT GETDATE(),
    __mj_UpdatedAt datetime NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_AIAgentProfileParam PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentProfileParam_Profile FOREIGN KEY (ProfileID) REFERENCES AIAgentProfile(ID)
)
```

## Key Features

### 1. Profile Hierarchy & Resolution

Profiles are resolved in the following priority order:
1. **Explicitly specified profile** (by ID or name)
2. **User-specific default profile** (if contextUser provided)
3. **Company-specific default profile** (if user has CompanyID)
4. **Agent default profile** (marked with IsDefault = 1)
5. **No profile** (fallback to just using provided data)

### 2. Security & Encryption

- Sensitive parameters marked with `IsEncrypted = 1`
- Integration with MemberJunction's existing encryption framework
- Audit trail through standard __mj fields
- Profile usage tracked in AIAgentRun records

### 3. Dynamic Value Resolution

The `Source` field enables different value sources:

- **`manual`**: Static values entered by users
- **`integration`**: Values pulled from CompanyIntegration records
- **`computed`**: Values calculated at runtime using custom logic

Example of integration-based parameter:
```json
{
    "Name": "salesforceApiKey",
    "Source": "integration",
    "SourceMetadata": {
        "integrationName": "Salesforce",
        "field": "APIKey"
    },
    "Type": "secure",
    "IsEncrypted": true
}
```

### 4. Variable Types

Supported parameter types:
- **`string`**: Plain text values
- **`number`**: Numeric values (integers or decimals)
- **`boolean`**: True/false values
- **`json`**: Complex objects or arrays
- **`secure`**: Sensitive values that should be encrypted

## Implementation Approach

### 1. Update ExecuteAgentParams

Add profile support to the agent execution parameters:

```typescript
export type ExecuteAgentParams<TContext = any, P = any> = {
    // ... existing fields ...
    
    /** Optional profile to apply to this agent execution */
    profileId?: string;
    
    /** Optional profile name (alternative to profileId) */
    profileName?: string;
    
    /** Whether to merge profile with provided data (true) or replace (false) */
    mergeProfileData?: boolean; // default: true
}
```

### 2. Profile Resolution in BaseAgent

```typescript
protected async resolveAgentProfile(
    params: ExecuteAgentParams
): Promise<Record<string, any>> {
    let profile = null;
    
    // 1. Try explicit profile
    if (params.profileId || params.profileName) {
        profile = await this.loadProfile(params.profileId, params.profileName);
    }
    
    // 2. Try user-specific profile
    if (!profile && params.contextUser) {
        profile = await this.loadUserDefaultProfile(
            params.agent.ID, 
            params.contextUser.ID
        );
    }
    
    // 3. Try company-specific profile
    if (!profile && params.contextUser?.CompanyID) {
        profile = await this.loadCompanyDefaultProfile(
            params.agent.ID,
            params.contextUser.CompanyID
        );
    }
    
    // 4. Try agent default profile
    if (!profile) {
        profile = await this.loadAgentDefaultProfile(params.agent.ID);
    }
    
    return profile ? await this.processProfileParams(profile) : {};
}
```

### 3. Integration with Existing Variable System

The profile data will be merged with the existing `data` parameter:

```typescript
// In BaseAgent.Execute()
const profileData = await this.resolveAgentProfile(params);

// Merge with existing data parameter
const mergedData = params.mergeProfileData !== false 
    ? { ...profileData, ...params.data }  // params.data overrides profile
    : { ...params.data, ...profileData }; // profile overrides params

// Pass to prompt execution
const promptParams = {
    ...existingParams,
    data: mergedData
};
```

### 4. Dynamic Value Processing

```typescript
protected async processProfileParams(
    profile: AIAgentProfileEntity
): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    
    for (const param of profile.Params) {
        let value = param.Value;
        
        // Handle different source types
        switch (param.Source) {
            case 'integration':
                value = await this.resolveIntegrationValue(param);
                break;
            case 'computed':
                value = await this.computeValue(param);
                break;
            case 'manual':
            default:
                // Use stored value
                break;
        }
        
        // Decrypt if needed
        if (param.IsEncrypted) {
            value = await this.decryptValue(value);
        }
        
        // Parse based on type
        result[param.Name] = this.parseValue(value, param.Type);
    }
    
    return result;
}
```

## Usage Examples

### Example 1: Marketing Agent with Regional Profiles

```typescript
// Profile: North America Division
const northAmericaProfile = {
    Name: "North America Division",
    Params: [
        { Name: "region", Value: "NA", Type: "string" },
        { Name: "currency", Value: "USD", Type: "string" },
        { Name: "timezone", Value: "America/New_York", Type: "string" },
        { Name: "marketingBudget", Value: "1000000", Type: "number" },
        { Name: "targetAudience", Value: '["B2B", "Enterprise"]', Type: "json" },
        { Name: "complianceRules", Value: '{"CCPA": true, "GDPR": false}', Type: "json" }
    ]
};

// Profile: Europe Division
const europeProfile = {
    Name: "Europe Division",
    Params: [
        { Name: "region", Value: "EU", Type: "string" },
        { Name: "currency", Value: "EUR", Type: "string" },
        { Name: "timezone", Value: "Europe/London", Type: "string" },
        { Name: "marketingBudget", Value: "800000", Type: "number" },
        { Name: "targetAudience", Value: '["B2B", "SMB"]', Type: "json" },
        { Name: "complianceRules", Value: '{"CCPA": false, "GDPR": true}', Type: "json" }
    ]
};

// Execute agent with profile
const result = await runner.RunAgent({
    agent: marketingAgent,
    conversationMessages: messages,
    profileName: "North America Division",
    contextUser: user
});
```

### Example 2: Integration-Based Profile

```typescript
// Profile that pulls credentials from company integrations
const salesforceProfile = {
    Name: "Salesforce Integration",
    CompanyID: "company-uuid",
    Params: [
        {
            Name: "sfApiKey",
            Source: "integration",
            SourceMetadata: JSON.stringify({
                integrationName: "Salesforce",
                field: "APIKey"
            }),
            Type: "secure",
            IsEncrypted: true
        },
        {
            Name: "sfInstanceUrl",
            Source: "integration",
            SourceMetadata: JSON.stringify({
                integrationName: "Salesforce",
                field: "AccessURL"
            }),
            Type: "string"
        },
        {
            Name: "sfApiVersion",
            Value: "v58.0",
            Type: "string",
            Source: "manual"
        }
    ]
};
```

### Example 3: User-Specific Profile

```typescript
// Profile for a specific user's preferences
const userPreferencesProfile = {
    Name: "John's Preferences",
    UserID: "user-uuid",
    IsDefault: true,
    Params: [
        { Name: "outputFormat", Value: "detailed", Type: "string" },
        { Name: "includeCharts", Value: "true", Type: "boolean" },
        { Name: "maxResultsPerPage", Value: "50", Type: "number" },
        { Name: "preferredLanguage", Value: "en-US", Type: "string" },
        { Name: "notificationEmail", Value: "john@example.com", Type: "string" }
    ]
};
```

## Benefits

1. **Flexibility**: Same agent adapts to different contexts without code changes
2. **Security**: Encrypted storage for sensitive data with proper access controls
3. **Maintainability**: Central management of agent variables in the database
4. **Scalability**: Easy to add new profiles without modifying agent code
5. **Integration**: Works seamlessly with existing MemberJunction patterns
6. **Auditability**: Full tracking of profile usage in agent run history
7. **User Experience**: Simplified agent execution with pre-configured settings

## Migration Strategy

### Phase 1: Infrastructure (Week 1-2)
1. Create database tables and entities
2. Update entity generation to include new entities
3. Add encryption support for secure parameters

### Phase 2: Core Implementation (Week 3-4)
1. Implement profile resolution in BaseAgent
2. Add profile parameter processing
3. Integrate with existing variable system
4. Add profile tracking to AIAgentRun

### Phase 3: UI and Management (Week 5-6)
1. Create profile management UI in MJ Explorer
2. Add profile selection to agent execution interfaces
3. Implement profile import/export functionality

### Phase 4: Advanced Features (Week 7-8)
1. Add computed value support
2. Implement integration-based value resolution
3. Add profile versioning and change tracking
4. Create profile templates for common scenarios

## Security Considerations

1. **Access Control**: Profiles respect existing MJ security model
2. **Encryption**: Sensitive values encrypted at rest using MJ encryption
3. **Audit Trail**: All profile usage tracked in agent runs
4. **Validation**: Parameter validation rules prevent invalid configurations
5. **Isolation**: Company and user-specific profiles are properly isolated

## Future Enhancements

1. **Profile Inheritance**: Child profiles inheriting from parent profiles
2. **Profile Templates**: Pre-built profiles for common use cases
3. **Dynamic Profiles**: Profiles that adjust based on runtime conditions
4. **Profile Marketplace**: Sharing profiles across organizations
5. **A/B Testing**: Running agents with different profiles for comparison
6. **Profile Analytics**: Understanding which profiles are most effective

## Conclusion

Agent Profiles provide a powerful, flexible mechanism for configuring agent behavior without code changes. By leveraging MemberJunction's existing infrastructure and patterns, this feature can be implemented efficiently while maintaining security and scalability. The proposed design balances simplicity with extensibility, allowing for future enhancements as requirements evolve.