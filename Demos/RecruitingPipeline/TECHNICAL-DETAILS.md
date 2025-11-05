# Recruiting Pipeline - Technical Details

This document provides comprehensive technical details about the Recruiting Pipeline demo implementation, including payload structures, agent step-by-step execution flows, database schema relationships, and integration specifications.

## Table of Contents

1. [Database Schema Details](#database-schema-details)
2. [Agent Execution Flows](#agent-execution-flows)
3. [Payload Structures](#payload-structures)
4. [AI Prompt Engineering](#ai-prompt-engineering)
5. [Integration Specifications](#integration-specifications)
6. [UI Component Architecture](#ui-component-architecture)
7. [Performance Considerations](#performance-considerations)

---

## Database Schema Details

### Entity Relationships

```
JobRequisition (1) ──< (M) Application (M) >── (1) Candidate
                                │
                                ├──< (M) Interview
                                └──< (M) ApplicationNote
```

### Field Details

#### HR.JobRequisition

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| ID | UNIQUEIDENTIFIER | PK, DEFAULT NEWID() | Primary key |
| Title | NVARCHAR(255) | NOT NULL | Job title |
| Description | NVARCHAR(MAX) | NOT NULL | Full job description |
| RequiredSkills | NVARCHAR(MAX) | NULL | JSON array of required skills |
| PreferredSkills | NVARCHAR(MAX) | NULL | JSON array of nice-to-have skills |
| EvaluationRubric | NVARCHAR(MAX) | NULL | JSON evaluation criteria |
| BaselinePassingScore | DECIMAL(5,2) | DEFAULT 70.0 | Minimum score to pass (0-100) |
| Status | NVARCHAR(50) | CHECK constraint | Draft, Open, Paused, Filled, Closed, Canceled |
| TypeformID | NVARCHAR(255) | NULL | TypeForm form identifier |
| TypeformMonitorEnabled | BIT | DEFAULT 0 | Enable automatic polling |

**Indexes:**
- Primary key on ID (clustered)

#### HR.Application

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| ID | UNIQUEIDENTIFIER | PK | Primary key |
| JobRequisitionID | UNIQUEIDENTIFIER | FK, NOT NULL | Links to job |
| CandidateID | UNIQUEIDENTIFIER | FK, NOT NULL | Links to candidate |
| TypeformResponseID | NVARCHAR(255) | UNIQUE | Deduplication key |
| ResumeEvaluationScore | DECIMAL(5,2) | NULL | AI resume score (0-100) |
| ResumeEvaluationDimensions | NVARCHAR(MAX) | NULL | JSON dimension scores |
| PassedResumeScreening | BIT | NULL | True/False/NULL |
| AudioAgentSessionID | NVARCHAR(255) | NULL | Audio session identifier |
| AudioEvaluationScore | DECIMAL(5,2) | NULL | AI audio score (0-100) |
| PassedAudioScreening | BIT | NULL | True/False/NULL |
| CurrentStage | NVARCHAR(50) | CHECK constraint | Current pipeline stage |
| Status | NVARCHAR(50) | CHECK constraint | Current application status |

**Indexes:**
- Primary key on ID (clustered)
- Foreign key on JobRequisitionID (nonclustered)
- Foreign key on CandidateID (nonclustered)
- Index on Status (nonclustered)
- Index on CurrentStage (nonclustered)

**Stage Values:**
- Application
- ResumeScreening
- AudioScreening
- PreliminaryInterview
- TechnicalInterview
- FinalInterview
- Offer
- Closed

**Status Values:**
- New
- Screening
- AudioScheduled
- AudioCompleted
- InterviewScheduled
- InterviewCompleted
- OfferExtended
- OfferAccepted
- Rejected
- Withdrawn

---

## Agent Execution Flows

### Application Processing Flow (Main Agent)

**Trigger:** Scheduled (every 15 minutes) OR Manual

**Step-by-Step Execution:**

#### Step 1: Get Active Job Requisitions
```json
{
  "Action": "Get Records",
  "EntityName": "Job Requisitions",
  "ExtraFilter": "TypeformMonitorEnabled = 1 AND Status = 'Open'",
  "Output": ["jobRequisitions"]
}
```

**Output Example:**
```json
{
  "jobRequisitions": [
    {
      "ID": "abc-123",
      "Title": "Senior Software Engineer",
      "TypeformID": "form-xyz",
      "BaselinePassingScore": 70.0
    }
  ]
}
```

#### Step 2: Process Each Job (ForEach Loop)

**Loop Variable:** `jobReq`
**Items:** `payload.jobRequisitions`
**Parallelizable:** `true`

##### Step 2.1: Calculate Since Date
```javascript
const now = new Date();
const sinceDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
return sinceDate.toISOString();
```

##### Step 2.2: Get TypeForm Responses
```json
{
  "Action": "Get Typeform Responses",
  "CompanyID": "jobReq.CompanyID",
  "FormID": "jobReq.TypeformID",
  "SinceDate": "payload.sinceDate",
  "CompletedOnly": true
}
```

**Output Example:**
```json
{
  "typeformResponses": [
    {
      "response_id": "resp-123",
      "submitted_at": "2025-11-05T10:30:00Z",
      "answers": {
        "full_name": "John Doe",
        "email": "john@example.com",
        "phone": "555-1234",
        "resume_upload": "https://typeform.com/file/xyz",
        "years_experience": "8"
      }
    }
  ],
  "totalResponses": 1
}
```

##### Step 2.3: Process Each Application (Nested ForEach)

Calls **Process Single Application** sub-agent for each response.

---

### Process Single Application (Sub-Agent)

**Input Payload:**
```json
{
  "jobRequisitionID": "guid",
  "jobTitle": "Senior Software Engineer",
  "jobDescription": "Full description...",
  "requiredSkills": "[\"TypeScript\", \"Angular\"]",
  "preferredSkills": "[\"Node.js\", \"SQL\"]",
  "minimumYearsExperience": 5,
  "evaluationRubric": "{\"weights\": {...}}",
  "baselinePassingScore": 70.0,
  "typeformResponseID": "resp-123",
  "submittedAt": "2025-11-05T10:30:00Z",
  "candidateName": "John Doe",
  "candidateEmail": "john@example.com",
  "candidatePhone": "555-1234",
  "resumeURL": "https://typeform.com/file/xyz",
  "currentTitle": "Software Engineer",
  "currentCompany": "TechCorp",
  "yearsExperience": 8,
  "typeformAnswers": "{...}",
  "companyID": "company-guid"
}
```

**Step-by-Step Execution:**

#### Step 1: Check Candidate Exists
```json
{
  "Action": "Get Records",
  "EntityName": "Candidates",
  "ExtraFilter": "Email = 'john@example.com'",
  "MaxRecords": 1,
  "Output": ["existingCandidate"]
}
```

#### Step 2: Create Candidate (Conditional: if not exists)
```json
{
  "Action": "Create Record",
  "EntityName": "Candidates",
  "Data": {
    "FullName": "John Doe",
    "Email": "john@example.com",
    "Phone": "555-1234",
    "ResumeURL": "https://typeform.com/file/xyz",
    "CurrentTitle": "Software Engineer",
    "CurrentCompany": "TechCorp",
    "YearsExperience": 8
  },
  "Output": ["candidateID"]
}
```

#### Step 3: Download Resume
```json
{
  "Action": "Typeform Get File Content",
  "CompanyID": "company-guid",
  "FileURL": "https://typeform.com/file/xyz",
  "Format": "text",
  "Output": ["resumeText"]
}
```

**Output Example:**
```json
{
  "resumeText": "JOHN DOE\nSoftware Engineer\n\nEXPERIENCE:\n- 8 years full-stack development\n- Expert in TypeScript, Angular, Node.js\n..."
}
```

#### Step 4: Check Application Exists
```json
{
  "Action": "Get Records",
  "EntityName": "Applications",
  "ExtraFilter": "TypeformResponseID = 'resp-123'",
  "MaxRecords": 1,
  "Output": ["existingApplication"]
}
```

#### Step 5: AI Resume Evaluation (Conditional: if new application)
```json
{
  "Type": "Prompt",
  "PromptName": "Evaluate Resume for Job Fit",
  "ModelName": "gpt-4o",
  "ResponseFormat": "json_object",
  "Input": {
    "jobTitle": "Senior Software Engineer",
    "requiredSkills": "[\"TypeScript\", \"Angular\"]",
    "resumeText": "JOHN DOE...",
    "baselinePassingScore": 70.0
  }
}
```

**AI Output:**
```json
{
  "resumeEvaluationScore": 82.5,
  "resumeEvaluationDimensions": {
    "skillsMatch": 85,
    "experienceLevel": 80,
    "educationFit": 75,
    "careerProgression": 90,
    "relevantAchievements": 83
  },
  "passedResumeScreening": true,
  "failureReasons": [],
  "reasoning": "Strong technical background..."
}
```

#### Step 6: Create Application Record
```json
{
  "Action": "Create Record",
  "EntityName": "Applications",
  "Data": {
    "JobRequisitionID": "guid",
    "CandidateID": "candidate-guid",
    "TypeformResponseID": "resp-123",
    "SubmittedAt": "2025-11-05T10:30:00Z",
    "CurrentStage": "ResumeScreening",
    "Status": "Screening",
    "ResumeEvaluationScore": 82.5,
    "ResumeEvaluationReasoning": "Strong technical background...",
    "ResumeEvaluationDimensions": "{\"skillsMatch\": 85, ...}",
    "PassedResumeScreening": true
  },
  "Output": ["applicationID"]
}
```

#### Step 7: Create Application Note
```json
{
  "Action": "Create Record",
  "EntityName": "Application Notes",
  "Data": {
    "ApplicationID": "application-guid",
    "NoteText": "Strong technical background...",
    "NoteType": "ResumeEvaluation",
    "IsSystemGenerated": true
  }
}
```

#### Step 8: Send Audio Invitation (Conditional: if passed)
```json
{
  "Action": "Send Email",
  "To": "john@example.com",
  "Subject": "Next Step: Tech Prescreening for Senior Software Engineer",
  "Body": "Congratulations! Your resume has passed our initial screening...",
  "TemplateID": "audio-screening-invitation"
}
```

#### Step 9: Update Application with Audio Link
```json
{
  "Action": "Update Record",
  "EntityName": "Applications",
  "RecordID": "application-guid",
  "Data": {
    "AudioAgentSessionURL": "https://audio-agent.com/session/xyz",
    "AudioAgentSessionID": "session-xyz",
    "Status": "AudioScheduled"
  }
}
```

---

### Audio Screening Monitor (Scheduled Agent)

**Trigger:** Scheduled (every 30 minutes)

**Step 1: Get Pending Audio Screenings**
```json
{
  "Action": "Get Records",
  "EntityName": "Applications",
  "ExtraFilter": "AudioAgentSessionID IS NOT NULL AND AudioEvaluationScore IS NULL AND Status = 'AudioScheduled'",
  "Output": ["pendingApplications"]
}
```

**Step 2: Process Each (ForEach → Sub-Agent)**

Calls **Process Audio Screening** sub-agent for each pending application.

---

### Process Audio Screening (Sub-Agent)

**Input Payload:**
```json
{
  "applicationID": "app-guid",
  "audioSessionID": "session-xyz",
  "audioSessionStatusURL": "https://audio-agent-api.com/sessions/session-xyz/status",
  "audioServiceAPIKey": "api-key"
}
```

**Step 1: Check Audio Session Status**
```json
{
  "Action": "HTTP Request",
  "URL": "https://audio-agent-api.com/sessions/session-xyz/status",
  "Method": "GET",
  "Headers": {
    "Authorization": "Bearer api-key"
  },
  "Output": ["sessionStatus", "audioRecordingURL", "audioTranscriptURL"]
}
```

**External API Response:**
```json
{
  "Status": "completed",
  "AudioURL": "https://audio-storage.com/recording-123.mp3",
  "TranscriptURL": "https://audio-storage.com/transcript-123.txt"
}
```

**Step 2: Download Transcript (Conditional: if completed)**
```json
{
  "Action": "HTTP Request",
  "URL": "https://audio-storage.com/transcript-123.txt",
  "Method": "GET",
  "Output": ["audioTranscript"]
}
```

**Step 3-4: Get Application and Job Details**
Loads full context for AI evaluation.

**Step 5: AI Audio Evaluation**
```json
{
  "Type": "Prompt",
  "PromptName": "Evaluate Audio Prescreening",
  "ModelName": "gemini-2.0-flash-exp",
  "ResponseFormat": "json_object",
  "Input": {
    "jobTitle": "Senior Software Engineer",
    "audioTranscript": "...",
    "audioRecordingURL": "...",
    "baselinePassingScore": 70.0
  }
}
```

**AI Output:**
```json
{
  "audioEvaluationScore": 88.0,
  "audioEvaluationDimensions": {
    "communicationSkills": 90,
    "technicalKnowledge": 85,
    "problemSolving": 88,
    "enthusiasm": 92,
    "cultureFit": 87
  },
  "passedAudioScreening": true,
  "reasoning": "Excellent communication...",
  "keyStrengths": ["Clear communication", "Strong problem-solving"],
  "areasOfConcern": ["Limited Kubernetes experience"]
}
```

**Step 6-10:** Update application, create note, send email (interview or rejection).

---

## Payload Structures

### TypeForm Response Format

```json
{
  "response_id": "string (unique)",
  "submitted_at": "ISO 8601 datetime",
  "answers": {
    "full_name": "string",
    "email": "string (unique)",
    "phone": "string",
    "resume_upload": "URL to file",
    "linkedin": "URL",
    "current_title": "string",
    "current_company": "string",
    "years_experience": "number as string",
    "why_interested": "text",
    "availability": "string"
  }
}
```

### Resume Evaluation Dimensions

```json
{
  "skillsMatch": 0-100,           // Required and preferred skills alignment
  "experienceLevel": 0-100,       // Years and relevance of experience
  "educationFit": 0-100,          // Education alignment with requirements
  "careerProgression": 0-100,     // Career growth and advancement
  "relevantAchievements": 0-100   // Quantifiable achievements in resume
}
```

**Weighted Score Calculation:**
```
resumeEvaluationScore =
  (skillsMatch * 0.35) +
  (experienceLevel * 0.25) +
  (educationFit * 0.10) +
  (careerProgression * 0.15) +
  (relevantAchievements * 0.15)
```

### Audio Evaluation Dimensions

```json
{
  "communicationSkills": 0-100,    // Clarity, articulation, professionalism
  "technicalKnowledge": 0-100,     // Depth of technical understanding
  "problemSolving": 0-100,         // Analytical thinking, reasoning
  "enthusiasm": 0-100,             // Energy level, genuine interest
  "cultureFit": 0-100              // Values alignment, collaboration
}
```

**Weighted Score Calculation:**
```
audioEvaluationScore =
  (communicationSkills * 0.25) +
  (technicalKnowledge * 0.30) +
  (problemSolving * 0.25) +
  (enthusiasm * 0.10) +
  (cultureFit * 0.10)
```

---

## AI Prompt Engineering

### Prompt Design Principles

1. **Structured Output:** All prompts return JSON objects with predictable schema
2. **Explicit Instructions:** Clear evaluation criteria and dimension definitions
3. **Weighted Scoring:** Transparent calculation methodology
4. **Pass/Fail Logic:** Binary decision with supporting reasoning
5. **Actionable Feedback:** Specific strengths and concerns for hiring decisions

### Resume Evaluation Prompt Structure

```markdown
[Context: Job Requirements]
- Job Title
- Required Skills
- Preferred Skills
- Minimum Experience
- Job Description

[Context: Candidate Information]
- Name
- Current Title/Company
- Years of Experience
- Resume Text
- TypeForm Answers

[Evaluation Instructions]
- Dimension definitions (5 dimensions)
- Scoring scale (0-100)
- Weighted average formula
- Pass/fail threshold

[Output Format]
- JSON schema with types
- Example output
- No additional text
```

### Audio Evaluation Prompt Structure

```markdown
[Context: Job Requirements]
- Job Title
- Required Skills
- Job Description

[Context: Candidate Background]
- Resume Score
- Resume Strengths

[Context: Audio Data]
- Transcript
- Audio Recording URL (for multimodal)

[Evaluation Instructions]
- Communication assessment criteria
- Technical knowledge evaluation
- Problem-solving indicators
- Tone and enthusiasm analysis

[Output Format]
- JSON with dimensions
- Key strengths array
- Areas of concern array
```

### Response Format Specification

All AI prompts use `ResponseFormat: "json_object"` which enforces:
- Valid JSON output only
- No explanatory text before/after JSON
- Schema adherence (via prompt instructions)
- Reliable parsing in agent workflows

---

## Integration Specifications

### TypeForm Integration

**Authentication:**
```
Authorization: Bearer {BIZAPPS_TYPEFORM_API_TOKEN}
```

**Get Responses Endpoint:**
```
GET https://api.typeform.com/forms/{form_id}/responses
Query Parameters:
  - since: ISO 8601 datetime
  - completed: true
  - page_size: 100
```

**Get File Content:**
```
GET {file_url_from_response}
Returns: File stream or text content
```

### Audio Agent Service Integration

**Status Check Endpoint:**
```
GET https://audio-agent-api.example.com/sessions/{session_id}/status
Headers:
  Authorization: Bearer {AUDIO_SERVICE_API_KEY}

Response:
{
  "Status": "completed" | "in_progress" | "failed",
  "AudioURL": "https://...",
  "TranscriptURL": "https://..."
}
```

**Create Session Endpoint:**
```
POST https://audio-agent-api.example.com/sessions
Headers:
  Authorization: Bearer {AUDIO_SERVICE_API_KEY}
Body:
{
  "CandidateEmail": "john@example.com",
  "JobTitle": "Senior Software Engineer",
  "Questions": ["Tell me about your experience with TypeScript..."]
}

Response:
{
  "SessionID": "session-xyz",
  "SessionURL": "https://audio-agent.com/session/xyz"
}
```

### Email Service Integration

**Send Email Action:**
```json
{
  "To": "recipient@example.com",
  "Subject": "Email subject",
  "Body": "Email body (HTML or plain text)",
  "TemplateID": "template-name"
}
```

**Email Templates:**
- `audio-screening-invitation`: Passed resume, invite to audio
- `interview-invitation`: Passed audio, schedule interview
- `audio-screening-rejection`: Failed audio screening
- `application-processing-summary`: Batch summary for hiring manager

---

## UI Component Architecture

### Service Pattern

**RecruitingService** centralizes all data access:
```typescript
class RecruitingService {
  // Individual entity queries
  getJobRequisitions(): Promise<BaseEntity[]>
  getApplicationsByJob(jobID): Promise<BaseEntity[]>

  // Batch loading for dashboards
  loadDashboardData(): Promise<{jobs, applications, candidates, interviews}>

  // Client-side aggregation
  getApplicationStatsByStage(apps): Map<string, number>
  getAverageResumeScore(apps): number
}
```

**Benefits:**
- Single source of truth for data access
- Reusable across multiple components
- Efficient batch loading with `RunViews`
- Client-side aggregation reduces database queries

### Form Component Pattern

```typescript
@Component({...})
export class ApplicationFormComponent extends BaseFormComponent implements OnInit {
  // Typed record access
  record: BaseEntity; // from BaseFormComponent

  // Related data
  candidate: BaseEntity | null = null;
  jobRequisition: BaseEntity | null = null;

  async ngOnInit() {
    await super.ngOnInit();
    await this.loadRelatedData();
  }

  async loadRelatedData() {
    // Load candidate, job, notes in parallel
    const [candidate, job, notes] = await Promise.all([...]);
  }
}
```

**Key Features:**
- Extends `BaseFormComponent` for standard form behavior
- Loads related data in `ngOnInit`
- Uses `ChangeDetectorRef` for programmatic updates
- Implements helper methods for display logic

### Dashboard Component Pattern

```typescript
@Component({...})
export class RecruitingDashboardComponent extends BaseDashboard implements OnInit {
  metrics: DashboardMetrics | null = null;

  async ngOnInit() {
    await this.loadData();
  }

  protected async loadData(): Promise<void> {
    // Batch load all data
    const data = await recruitingService.loadDashboardData();

    // Calculate metrics client-side
    this.metrics = {
      openPositions: data.jobs.filter(j => j.Status === 'Open').length,
      averageScore: this.calculateAverage(data.applications),
      ...
    };
  }
}
```

**Performance Optimization:**
- Single batch query (`loadDashboardData`) instead of multiple individual queries
- Client-side aggregation and filtering
- Observables with `shareReplay(1)` for caching
- Lazy loading of expensive operations

---

## Performance Considerations

### Database Query Optimization

**Use RunViews (Plural) for Batch Loading:**
```typescript
// BAD: Multiple separate queries
const jobs = await rv.RunView({EntityName: 'Job Requisitions', ...});
const apps = await rv.RunView({EntityName: 'Applications', ...});

// GOOD: Single batch operation
const [jobs, apps] = await rv.RunViews([
  {EntityName: 'Job Requisitions', ...},
  {EntityName: 'Applications', ...}
]);
```

**Benefits:**
- Reduces round trips to database
- Parallelizes query execution on server
- Faster dashboard loading (2-3 queries vs 20+)

### Agent Performance

**Parallel ForEach Processing:**
```json
{
  "Type": "ForEach",
  "Parallelizable": true,
  "ContinueOnError": true
}
```

**Impact:**
- Processes 100 applications in ~2 minutes (parallel) vs ~20 minutes (sequential)
- Uses thread pool for concurrent execution
- Gracefully handles individual failures

### AI Model Selection

**Resume Evaluation:** GPT-4o
- High accuracy for structured evaluation
- Reliable JSON output
- Good cost/performance balance

**Audio Evaluation:** Gemini 2.0 Flash Exp
- Multimodal support (audio + text)
- Faster inference than GPT-4
- Lower cost for high-volume screening

### Caching Strategies

**Application-Level:**
- Cache job requisitions for 5 minutes (rarely change)
- Cache candidate profiles (deduplicated lookups)
- Use ETags for TypeForm response polling

**Database-Level:**
- Index on Application.Status for filtered queries
- Index on Application.CurrentStage for pipeline views
- Composite index on (JobRequisitionID, Status) for job-specific queries

---

## Error Handling

### Agent Error Patterns

**ForEach with ContinueOnError:**
```json
{
  "Type": "ForEach",
  "ContinueOnError": true
}
```
- Individual application failures don't stop batch processing
- Errors logged to ApplicationNote with NoteType='System'

**Conditional Path Validation:**
```json
{
  "ConditionalPath": "payload.resumeEvaluation != null && payload.resumeEvaluation.passedResumeScreening === true"
}
```
- Checks for null before accessing properties
- Prevents downstream errors from missing data

### UI Error Handling

**Service Layer:**
```typescript
const result = await rv.RunView<ApplicationEntity>({...});
if (result.Success) {
  return result.Results || [];
} else {
  console.error('Failed to load:', result.ErrorMessage);
  return [];
}
```

**Component Layer:**
```typescript
try {
  await this.loadData();
} catch (error) {
  this.errorMessage = 'Failed to load dashboard data';
  this.loading = false;
}
```

---

## Testing Strategies

### Unit Testing Agents

**Test Sub-Agents Independently:**
```typescript
const payload = {
  jobRequisitionID: 'test-guid',
  candidateEmail: 'test@example.com',
  resumeText: 'Test resume...',
  baselinePassingScore: 70.0
};

const result = await aiAgentRunner.RunAgent('Process Single Application', payload);
assert(result.Success);
assert(result.Output.applicationID != null);
```

### Integration Testing

**Test TypeForm → Application Flow:**
1. Create test TypeForm with sample data
2. Configure job requisition with test form ID
3. Trigger "Application Processing Flow" agent
4. Verify Application records created
5. Check ApplicationNote entries

### Performance Testing

**Benchmark Parallel Processing:**
```typescript
// Test with 10, 50, 100, 500 applications
const startTime = Date.now();
await aiAgentRunner.RunAgent('Application Processing Flow', payload);
const duration = Date.now() - startTime;
console.log(`Processed ${count} applications in ${duration}ms`);
```

---

## Deployment Checklist

- [ ] Install database schema
- [ ] Run CodeGen to generate entity classes
- [ ] Sync metadata (agents, prompts, dashboards)
- [ ] Configure TypeForm API token
- [ ] Configure Audio Agent service credentials
- [ ] Configure email service credentials
- [ ] Set up scheduled triggers for monitoring agents
- [ ] Test end-to-end flow with sample data
- [ ] Verify dashboard metrics display correctly
- [ ] Set up monitoring and alerting for agent failures

---

## Appendix: SQL Queries

### Get Applications by Stage
```sql
SELECT
    a.ID,
    c.FullName AS CandidateName,
    j.Title AS JobTitle,
    a.CurrentStage,
    a.Status,
    a.ResumeEvaluationScore,
    a.AudioEvaluationScore,
    a.SubmittedAt
FROM HR.Application a
JOIN HR.Candidate c ON a.CandidateID = c.ID
JOIN HR.JobRequisition j ON a.JobRequisitionID = j.ID
WHERE a.CurrentStage = 'AudioScreening'
ORDER BY a.SubmittedAt DESC;
```

### Get Top Candidates by Score
```sql
SELECT TOP 10
    c.FullName,
    j.Title AS JobTitle,
    a.ResumeEvaluationScore,
    a.AudioEvaluationScore,
    (a.ResumeEvaluationScore + ISNULL(a.AudioEvaluationScore, 0)) / 2 AS AverageScore
FROM HR.Application a
JOIN HR.Candidate c ON a.CandidateID = c.ID
JOIN HR.JobRequisition j ON a.JobRequisitionID = j.ID
WHERE a.ResumeEvaluationScore IS NOT NULL
ORDER BY AverageScore DESC;
```

### Get Pipeline Conversion Rates
```sql
WITH StageCounts AS (
    SELECT
        CurrentStage,
        COUNT(*) AS StageCount
    FROM HR.Application
    GROUP BY CurrentStage
)
SELECT
    CurrentStage,
    StageCount,
    (StageCount * 100.0 / SUM(StageCount) OVER ()) AS Percentage
FROM StageCounts
ORDER BY
    CASE CurrentStage
        WHEN 'Application' THEN 1
        WHEN 'ResumeScreening' THEN 2
        WHEN 'AudioScreening' THEN 3
        WHEN 'PreliminaryInterview' THEN 4
        WHEN 'TechnicalInterview' THEN 5
        WHEN 'FinalInterview' THEN 6
        WHEN 'Offer' THEN 7
        ELSE 99
    END;
```

---

**Last Updated:** 2025-11-05
**Version:** 1.0.0
