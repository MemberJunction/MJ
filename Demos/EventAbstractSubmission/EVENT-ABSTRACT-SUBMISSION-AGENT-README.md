# Event Abstract Submission Flow Agent

## Overview

A Flow-based agent system for automatically processing Typeform abstract submissions for conferences/events. The system polls Typeform for new responses and creates structured database records for submissions, speakers, and their relationships.

## Architecture

### Main Agent: Event Abstract Submission Flow Agent
**Type**: Flow Agent (Deterministic)
**Purpose**: Orchestrates the overall workflow

**Steps**:
1. **Get Typeform Responses** - Polls Typeform API for new submissions
2. **Process Each Response** - ForEach loop that delegates to sub-agent
3. **Complete** - Returns summary of processing results

### Sub-Agent: Process Single Submission
**Type**: Flow Agent (Deterministic)
**Purpose**: Processes one Typeform response

**Steps**:
1. **Create Submission** - Creates Submission entity record
2. **Create Speakers** - ForEach loop to create Speaker records
3. **Link Speakers to Submission** - Creates SubmissionSpeaker junction records
4. **Complete** - Returns confirmation

## Files Created

### Agent Definitions
- `/metadata/agents/.event-abstract-submission-flow-agent.json` - Main agent definition
- `/metadata/agents/.process-single-submission.json` - Sub-agent definition

### Prompts
- `/metadata/prompts/.event-abstract-submission-prompts.json` - Prompt definitions (uses @file references)

### Prompt Templates (Only for Prompt Steps!)
- `/metadata/prompts/templates/event-abstract-submission/no-responses.template.md` - No responses message
- `/metadata/prompts/templates/event-abstract-submission/complete-summary.template.md` - Success summary
- `/metadata/prompts/templates/event-abstract-submission/sub-agent-complete.template.md` - Sub-agent completion message

**Note**: Flow agents do NOT have "system prompts" - prompts are only used for Prompt-type steps that return messages to users!

## Payload Structure

### Main Agent Initial Payload
```json
{
  "typeformFormID": "abc123",           // Required: Typeform form ID
  "eventID": "uuid-here",               // Required: Event ID from Events table
  "lastCheckDate": "2025-10-29T00:00:00Z",  // Optional: For incremental polling
  "autoEvaluate": true                  // Optional: Defaults to true if not specified
}
```

### Sub-Agent Payload (per iteration)
```json
{
  "response": {                         // Typeform response object
    "response_id": "abc123",
    "submitted_at": "2025-10-29T12:00:00Z",
    "title": "My Awesome Talk",
    "abstract": "Full abstract text...",
    "submissionType": "Talk",
    "targetAudience": "Intermediate",
    "techLevel": "Advanced",
    "speakers": [
      {
        "firstName": "Jane",
        "lastName": "Doe",
        "email": "jane@example.com",
        "company": "Acme Corp",
        "title": "Senior Engineer",
        "bio": "Bio text...",
        "linkedin": "https://linkedin.com/in/janedoe",
        "twitter": "@janedoe"
      }
    ]
  },
  "eventID": "uuid-here",               // Passed from main agent
  "submissionID": "uuid-here"           // Populated after submission created
}
```

## Key Design Decisions

### 1. No Speaker Deduplication (By Design)
- Agent creates speaker records directly without checking for duplicates
- **Rationale**:
  - No "Query Records with Filter" action available
  - "Get Record" requires primary key (not email lookup)
  - Prioritizes speed and reliability
  - Deduplication should be handled as separate cleanup process or database constraint

### 2. Flow Agent (Not Loop Agent)
- Deterministic workflow = predictable, fast, no LLM calls between steps
- Perfect for structured data transformation
- Easy to debug and test

### 3. Sub-Agent Pattern
- Main agent: ForEach over responses → calls sub-agent per response
- Sub-agent: Handles single response with its own speaker ForEach
- Clean separation of concerns
- Easier to test individual response processing

### 4. Syntax (NO Nunjucks)
Flow agents use:
- `"payload.path.to.value"` - access payload
- `"static:value"` - static strings
- `"item.field"` - access loop item (where "item" is itemVariable)
- `"index"` - loop index
- Direct primitives: `true`, `123`, etc.

**NO** `{{}}` syntax needed!

## Metadata Order (Important!)

Steps are defined in **reverse order** in the JSON file because:
- Steps must exist before being referenced in paths
- File reads top-to-bottom
- Paths reference steps by lookup, so steps come first
- "Later" logical steps are defined "earlier" in file

Order in file:
1. Complete steps (last logically, first in file)
2. Middle steps
3. Starting steps (first logically, last in file before paths)
4. Paths (very last)

## Actions Used

All actions already exist:
- `Get Typeform Responses` - From FormBuilders package
- `Create Record` - Core MJ action for entity creation

## Testing

### Step 1: Sync Metadata
```bash
npx mj-sync push
```

### Step 2: Test with Payload
```typescript
const runner = new AgentRunner();
const result = await runner.RunAgent({
  agent: 'Event Abstract Submission Flow Agent',
  payload: {
    typeformFormID: 'your-form-id',
    eventID: 'your-event-uuid',
    autoEvaluate: true
  },
  contextUser: user
});
```

### Step 3: Verify Database
Check Events schema:
- `Events.Submission` - Should have new records
- `Events.Speaker` - Should have speaker records
- `Events.SubmissionSpeaker` - Should have junction records

## Future Enhancements

1. **Speaker Deduplication**
   - Create "Find or Create Speaker" action with email lookup
   - Or handle in database with UNIQUE constraint on Email + merge logic

2. **AI Evaluation**
   - Add conditional path to evaluation sub-agent
   - Triggered when `autoEvaluate == true`

3. **Email Notifications**
   - Add step to send confirmation emails to speakers
   - Use "Send Single Message" action

4. **Duplicate Submission Detection**
   - Check TypeformResponseID before creating
   - Skip if already processed

## Database Schema Requirements

Requires Events schema to be installed:
- `Events.Event`
- `Events.Submission`
- `Events.Speaker`
- `Events.SubmissionSpeaker`

See: `/SQL Scripts/demo/Events Schema - Abstract Submission Management.sql`
