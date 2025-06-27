# Payload and State Management Guide

## Overview

The MemberJunction AI Agent framework provides a sophisticated payload management system that controls data flow between parent agents and their sub-agents. This system ensures efficient token usage, maintains data integrity, and provides fine-grained control over what information sub-agents can access and modify.

## Core Concepts

### Payload
The payload is a JSON object that represents the current state of an agent's execution. It flows through the agent hierarchy, carrying data, results, and context needed for decision-making and task completion.

### Payload Access Control
Each agent can define two sets of JSON paths:
1. **Downstream Paths** (`PayloadDownstreamPaths`): What data the agent sends to its sub-agents
2. **Upstream Paths** (`PayloadUpstreamPaths`): What data sub-agents are allowed to write back

## Configuration

### Database Fields
In the `AIAgent` table, configure access control using:
- `PayloadDownstreamPaths`: JSON array of paths to send downstream (default: `["*"]`)
- `PayloadUpstreamPaths`: JSON array of paths sub-agents can write (default: `["*"]`)

### Path Syntax

The system supports various path patterns:

#### 1. **Wildcard** - Full Access
```json
["*"]
```
Allows complete payload access (downstream) or modification rights (upstream).

#### 2. **Exact Paths**
```json
["customer.name", "order.id", "analysis.status"]
```
Grants access to specific fields only.

#### 3. **Object Wildcards**
```json
["customer.*", "order.items.*"]
```
Allows all properties under a specific object.

#### 4. **Array Access**
```json
["items[0]", "items[*].price", "customers[*].orders[*]"]
```
- Specific index: `items[0]`
- All array elements: `items[*]`
- Nested arrays: `customers[*].orders[*]`

#### 5. **Deep Wildcards**
```json
["**.id", "**.status"]
```
Matches properties at any depth in the object tree.

## Examples

### Marketing Campaign Agent Hierarchy

Consider a marketing agent with specialized sub-agents:

```json
// Full Payload Structure
{
  "campaign": {
    "id": "camp-123",
    "budget": 50000,
    "status": "active",
    "target_audience": {
      "age_range": "25-45",
      "interests": ["technology", "fitness"]
    }
  },
  "customer": {
    "id": "cust-456",
    "name": "Acme Corp",
    "industry": "Tech",
    "preferences": {
      "communication": "email",
      "frequency": "weekly"
    }
  },
  "analysis": {
    "sentiment": null,
    "recommendations": null,
    "copy": null
  }
}
```

#### Parent Agent: Marketing Strategist
```json
{
  "PayloadDownstreamPaths": ["*"],      // Sends everything to sub-agents
  "PayloadUpstreamPaths": ["*"]         // Accepts all updates
}
```

#### Sub-Agent: Copywriter
```json
{
  "PayloadDownstreamPaths": [
    "campaign.target_audience",         // Needs audience info
    "customer.preferences",             // Needs customer preferences
    "analysis.sentiment"                // Needs sentiment if available
  ],
  "PayloadUpstreamPaths": [
    "analysis.copy",                    // Can only write copy
    "analysis.recommendations.tone"     // Can suggest tone
  ]
}
```

#### Sub-Agent: Budget Analyzer
```json
{
  "PayloadDownstreamPaths": [
    "campaign.budget",                  // Needs budget info
    "campaign.status"                   // Needs campaign status
  ],
  "PayloadUpstreamPaths": [
    "analysis.recommendations.budget",  // Can only write budget recommendations
    "analysis.recommendations.allocation"
  ]
}
```

## How It Works

### 1. **Downstream Flow** (Parent → Sub-agent)
When a parent agent invokes a sub-agent:
1. The system reads the sub-agent's `PayloadDownstreamPaths`
2. Extracts only the specified paths from the parent's payload
3. Sends the filtered payload to the sub-agent

### 2. **Upstream Flow** (Sub-agent → Parent)
When a sub-agent completes:
1. The system reads the sub-agent's `PayloadUpstreamPaths`
2. Compares the sub-agent's returned payload with allowed paths
3. Merges only authorized changes back into the parent's payload
4. Logs warnings for unauthorized write attempts (but continues execution)

### 3. **Deep Hierarchy**
For agents beyond the second level:
- Can only access data their immediate parent has access to
- Must still specify explicit paths relative to the root payload
- Access is the intersection of their paths and their parent's access

## Best Practices

### 1. **Principle of Least Privilege**
Only grant access to data that sub-agents actually need:
```json
// ❌ Too permissive
["*"]

// ✅ Specific access
["customer.id", "customer.industry", "analysis.market_research"]
```

### 2. **Structured Payload Design**
Organize your payload with clear boundaries:
```json
{
  "input": {           // Read-only data from user
    "requirements": {},
    "constraints": {}
  },
  "working": {         // Shared working space
    "analysis": {},
    "calculations": {}
  },
  "output": {          // Final results
    "recommendations": {},
    "report": {}
  }
}
```

### 3. **Downstream vs Upstream Symmetry**
Consider whether downstream paths should match upstream paths:
```json
// Asymmetric (common pattern)
{
  "PayloadDownstreamPaths": ["customer.*", "analysis.*"],  // Read more
  "PayloadUpstreamPaths": ["analysis.results"]             // Write less
}

// Symmetric (for peer agents)
{
  "PayloadDownstreamPaths": ["shared.*"],
  "PayloadUpstreamPaths": ["shared.*"]
}
```

### 4. **Documentation**
Document your payload structure and access patterns:
```typescript
interface MarketingPayload {
  campaign: {
    id: string;          // Read-only for all sub-agents
    budget: number;      // Writable by: BudgetAnalyzer
    // ... etc
  };
}
```

## Debugging

### Enable Verbose Logging
The PayloadManager logs warnings when sub-agents attempt unauthorized writes:
```
Warning: Sub-agent attempted to write to unauthorized path: campaign.budget
```

### Trace Payload Flow
To debug payload transformations:
1. Log the filtered downstream payload before sending
2. Log the returned payload from sub-agents
3. Log the merged result after applying upstream rules

### Common Issues

#### 1. **Sub-agent Not Receiving Expected Data**
- Check the sub-agent's `PayloadDownstreamPaths`
- Verify the path syntax is correct
- Ensure parent has the data in its payload

#### 2. **Sub-agent Changes Not Persisting**
- Check the sub-agent's `PayloadUpstreamPaths`
- Verify the sub-agent is setting the correct paths
- Look for warning logs about unauthorized writes

#### 3. **JSON Parse Errors**
- Ensure paths arrays are valid JSON
- Use JSON array syntax: `["path1", "path2"]`
- Escape special characters properly

## Advanced Patterns

### 1. **Conditional Access**
Use wildcards for dynamic structures:
```json
["responses.*.content", "responses.*.metadata.public"]
```

### 2. **Hierarchical Permissions**
Design paths that naturally support delegation:
```json
{
  "team": {
    "marketing": { "campaigns": {}, "budget": {} },
    "sales": { "leads": {}, "opportunities": {} }
  }
}
// Marketing agent: ["team.marketing.*"]
// Sales agent: ["team.sales.*"]
```

### 3. **Versioned Payloads**
Include version info for backward compatibility:
```json
{
  "version": "1.0",
  "data": { /* actual payload */ }
}
```

## Performance Considerations

### Token Efficiency
Restricting downstream paths reduces token usage in prompts:
- Full payload: 5,000 tokens
- Filtered payload: 500 tokens (90% reduction)

### Processing Overhead
The PayloadManager uses efficient algorithms:
- Path extraction: O(n) where n is number of paths
- Merge operations: O(m) where m is number of changes
- Minimal performance impact even with complex payloads

## Security Considerations

### Data Isolation
- Sub-agents cannot access data outside their allowed paths
- Prevents accidental exposure of sensitive information
- Maintains clear boundaries between agent responsibilities

### Audit Trail
- All unauthorized write attempts are logged
- Execution trees show exact payload transformations
- Complete traceability for compliance needs

## Integration with Agent Types

Different agent types can implement custom payload handling:

### LoopAgentType
Uses payload to maintain state across iterations:
```typescript
// Injects previous iteration's payload
prompt.data[LoopAgentType.CURRENT_PAYLOAD_PLACEHOLDER] = payload;
```

### Custom Agent Types
Can override payload injection/extraction methods:
```typescript
class CustomAgentType extends BaseAgentType {
  async InjectPayload<T>(payload: T, prompt: AIPromptParams): Promise<void> {
    // Custom injection logic
  }
  
  async RetrievePayload<T>(promptResult: AIPromptRunResult): Promise<T> {
    // Custom extraction logic
  }
}
```

## Future Enhancements

1. **Path Transformations**: Allow renaming paths between layers
2. **Conditional Paths**: Grant access based on payload values
3. **Path Templates**: Reusable path configurations
4. **Runtime Path Validation**: Validate paths exist before execution
5. **Path Aliases**: Simplify complex path specifications

## Conclusion

The payload management system provides powerful capabilities for controlling data flow in agent hierarchies. By carefully designing payload structures and access patterns, you can build efficient, secure, and maintainable multi-agent systems that minimize token usage while maximizing agent autonomy and capability.