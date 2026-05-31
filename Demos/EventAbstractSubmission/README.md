# Event Abstract Submission Demo

A complete demonstration application showing how to build an automated conference abstract submission system using MemberJunction Flow agents, Typeform integration, and the Events database schema.

## Overview

This demo showcases:
- **Flow Agents** - Deterministic workflow orchestration
- **Sub-Agent Pattern** - Delegating work to specialized agents
- **ForEach Loops** - Batch processing of responses and speakers
- **Typeform Integration** - Polling for new form submissions
- **Database Integration** - Creating structured records from form data
- **Events Schema** - Conference/event management data model

## Architecture

### Flow Agents

**Main Agent: Event Abstract Submission Flow Agent**
- Polls Typeform for new responses
- ForEach loop over responses → delegates to sub-agent
- Returns summary of processing

**Sub-Agent: Process Single Submission**
- Creates Submission record
- ForEach loop over speakers → creates Speaker records
- Creates SubmissionSpeaker junction records

### Database Schema

Requires the Events schema from `/SQL Scripts/demo/`:
- `Events.Event` - Conference/event information
- `Events.Submission` - Abstract submissions
- `Events.Speaker` - Speaker profiles
- `Events.SubmissionSpeaker` - Many-to-many junction table

## Project Structure

```
/Demos/EventAbstractSubmission
├── metadata/
│   ├── agents/
│   │   ├── .event-abstract-submission-flow-agent.json
│   │   └── .process-single-submission.json
│   ├── prompts/
│   │   ├── .event-abstract-submission-prompts.json
│   │   └── templates/
│   │       └── event-abstract-submission/
│   │           ├── no-responses.template.md
│   │           ├── complete-summary.template.md
│   │           └── sub-agent-complete.template.md
│   └── .mj-sync.json
├── EVENT-ABSTRACT-SUBMISSION-AGENT-README.md (detailed docs)
└── README.md (this file)
```

## Setup Instructions

### 1. Install Database Schema

```bash
cd /Users/amith/Dropbox/develop/Mac/MJ/SQL\ Scripts/demo
# Run these in order:
sqlcmd -S your-server -d your-db -i "CRM Schema 1.sql"
sqlcmd -S your-server -d your-db -i "Events Schema - Abstract Submission Management.sql"
```

Or use your preferred SQL client to execute the schema files.

### 2. Run CodeGen

```bash
cd /Users/amith/Dropbox/develop/Mac/MJ
npm run codegen
```

This generates strongly-typed entity classes for:
- `EventEntity`
- `SubmissionEntity`
- `SpeakerEntity`
- `SubmissionSpeakerEntity`

### 3. Sync Metadata to Database

```bash
cd /Users/amith/Dropbox/develop/Mac/MJ/Demos/EventAbstractSubmission/metadata
npx mj-sync push
```

This creates:
- 2 AI Agents in the database
- 3 AI Prompts
- Links to existing actions (Get Typeform Responses, Create Record)

### 4. Configure Typeform

Set up environment variables for Typeform API access:
```bash
# In your .env or environment
BIZAPPS_TYPEFORM_API_TOKEN=your_token_here
# Or for multi-tenant:
BIZAPPS_TYPEFORM_COMPANYID_API_TOKEN=your_token_here
```

### 5. Create Test Event

Create an event in the database (via MJExplorer or SQL):
```sql
INSERT INTO Events.Event (Name, StartDate, EndDate, Status)
VALUES ('Tech Summit 2026', '2026-03-15', '2026-03-17', 'Planning');
```

Note the Event ID for testing.

## Testing the Agent

### Option 1: Via TypeScript Script (Future)

When you add code to `/src`, you can test programmatically:
```typescript
import { AgentRunner } from '@memberjunction/ai-agents';

const runner = new AgentRunner();
const result = await runner.RunAgent({
  agentName: 'Event Abstract Submission Flow Agent',
  payload: {
    typeformFormID: 'abc123',
    eventID: 'your-event-uuid',
    autoEvaluate: true
  },
  contextUser: user
});
```

### Option 2: Via MJExplorer UI

1. Start MJExplorer: `npm run start:explorer`
2. Navigate to AI Agents
3. Find "Event Abstract Submission Flow Agent"
4. Execute with payload
5. View results

### Option 3: Via GraphQL API

1. Start MJAPI: `npm run start:api`
2. Use GraphQL client or curl:
```graphql
mutation {
  executeAgent(
    agentName: "Event Abstract Submission Flow Agent"
    payload: {
      typeformFormID: "abc123"
      eventID: "uuid-here"
      autoEvaluate: true
    }
  ) {
    success
    message
    payload
  }
}
```

## Payload Structure

### Input Payload
```json
{
  "typeformFormID": "abc123",           // Required: Your Typeform form ID
  "eventID": "uuid-here",               // Required: Event ID from Events.Event
  "lastCheckDate": "2025-10-29T00:00:00Z",  // Optional: For incremental polling
  "autoEvaluate": true                  // Optional: Trigger AI evaluation (default: true)
}
```

### Expected Typeform Response Format
```json
{
  "response_id": "abc123",
  "submitted_at": "2025-10-29T12:00:00Z",
  "title": "My Talk Title",
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
}
```

## Design Decisions

### Why Flow Agents?
- **Deterministic** - Predictable, fast execution
- **No LLM overhead** - No AI calls between steps (just actions)
- **Easy to debug** - Clear workflow graph
- **Efficient** - Perfect for structured data transformation

### Why Sub-Agent Pattern?
- **Clean separation** - Main agent handles orchestration, sub-agent handles single record
- **Testable** - Can test sub-agent independently
- **Reusable** - Sub-agent could be called from other contexts

### Speaker Deduplication
Currently, the agent creates speaker records without checking for duplicates. This is intentional:
- **Prioritizes speed** - No query overhead per speaker
- **No "Query with Filter" action** - MJ doesn't have a generic query action yet
- **Database constraints** - Can add UNIQUE constraint on email for automatic deduplication
- **Future enhancement** - Create custom "Find or Create Speaker" action

## Future Enhancements

### Phase 2: AI Evaluation
Add a sub-agent or Loop agent to:
- Evaluate abstract quality against rubric
- Score submissions (0-100)
- Provide reasoning and feedback
- Trigger different workflow paths based on score

### Phase 3: Speaker Research
Add Loop agent to:
- Research speaker background (LinkedIn, publications)
- Calculate credibility score
- Generate speaker dossier
- Flag any red flags

### Phase 4: Automated Notifications
Add steps to:
- Send confirmation emails to speakers
- Notify reviewers of new submissions
- Send acceptance/rejection emails

### Phase 5: Review Workflow
Add Loop agent for human review:
- Assign submissions to reviewers
- Collect reviewer feedback
- Make final accept/reject decisions
- Handle waitlist management

## Files in This Demo

See `EVENT-ABSTRACT-SUBMISSION-AGENT-README.md` for detailed technical documentation including:
- Complete workflow diagrams
- Step-by-step execution flow
- Payload transformations
- Troubleshooting guide

## Learn More

- [MemberJunction Agents Documentation](https://docs.memberjunction.org)
- [Flow Agent Guide](../../../packages/AI/Agents/README.md)
- [Actions Framework](../../../packages/Actions/README.md)
- [Typeform Integration](../../../packages/Actions/BizApps/FormBuilders/README.md)

## Contributing

This is a demo application. To extend it:

1. Add custom code to `/src` directory
2. Create custom actions in `/metadata/actions`
3. Extend agents with new steps
4. Add new sub-agents for specialized tasks

For questions or improvements, please file an issue in the MJ repository.
