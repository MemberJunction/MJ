# FormBuilders Additional Providers - Implementation Plan

## Status Summary

### ✅ Completed
- **Typeform**: Full 8 actions implemented and metadata created
- **JotForm**: Base action class created
- **Package structure**: Ready for all providers

### 🔄 In Progress
- JotForm, SurveyMonkey, Google Forms action implementations

---

## JotForm Implementation

### Base Class: ✅ DONE
`src/providers/jotform/jotform-base.action.ts`

### Actions to Implement (8 total)

All follow same pattern as Typeform but using JotForm API:

1. **Get JotForm Submissions** → `get-submissions.action.ts`
   - Endpoint: `GET /form/{formId}/submissions`
   - Pagination: offset/limit based
   - Filter support via JSON string param

2. **Get Single JotForm Submission** → `get-single-submission.action.ts`
   - Endpoint: `GET /submission/{submissionId}`

3. **Get JotForm Submission Statistics** → `get-statistics.action.ts`
   - Fetch all submissions, calculate client-side
   - Same calculations as Typeform

4. **Export JotForm Submissions to CSV** → `export-csv.action.ts`
   - Use base class `convertToCSV()` method
   - Same as Typeform

5. **Watch for New JotForm Submissions** → `watch-new-submissions.action.ts`
   - Filter: `{"created_at:gt": "timestamp"}`
   - Same pattern as Typeform

6. **Get JotForm Details** → `get-form.action.ts`
   - Endpoint: `GET /form/{formId}`
   - Returns form properties

7. **Create JotForm** → `create-form.action.ts`
   - Endpoint: `POST /user/forms`
   - Body: form JSON structure
   - Returns form ID

8. **Update JotForm** → `update-form.action.ts`
   - Endpoint: `PUT /form/{formId}/properties`
   - Update specific properties

### Key Differences from Typeform:
- API Key in query params: `?apiKey={key}`
- Regional endpoints: US, EU, HIPAA
- Filter format: JSON string
- Submissions (not responses) terminology
- Can POST submissions programmatically

---

## SurveyMonkey Implementation

### Base Class Needed
`src/providers/surveymonkey/surveymonkey-base.action.ts`

**Authentication**: OAuth 2.0 Bearer token

### Actions to Implement (8 total)

1. **Get SurveyMonkey Responses** → `get-responses.action.ts`
   - Endpoint: `GET /surveys/{id}/responses/bulk`
   - Parameters: per_page, page, status, start_created_at, end_created_at
   - Rate limit: 120 req/min (free), higher for paid

2. **Get Single SurveyMonkey Response** → `get-single-response.action.ts`
   - Endpoint: `GET /surveys/{id}/responses/{response_id}`

3. **Get SurveyMonkey Response Statistics** → `get-statistics.action.ts`
   - Use bulk responses endpoint + client calculations
   - Can also use: `GET /surveys/{id}/responses/analytics`

4. **Export SurveyMonkey Responses to CSV** → `export-csv.action.ts`
   - Fetch bulk responses, convert to CSV

5. **Watch for New SurveyMonkey Responses** → `watch-new-responses.action.ts`
   - Use `start_created_at` parameter
   - Poll for new responses since last check

6. **Get SurveyMonkey Details** → `get-survey.action.ts`
   - Endpoint: `GET /surveys/{id}/details`
   - Returns full survey structure with questions

7. **Create SurveyMonkey Survey** → `create-survey.action.ts`
   - Endpoint: `POST /surveys`
   - Body: survey JSON with title and pages array
   - **NOTE**: May require approval for public apps

8. **Update SurveyMonkey Survey** → `update-survey.action.ts`
   - Endpoint: `PATCH /surveys/{id}`
   - Can update title, pages, questions
   - **NOTE**: May require approval for public apps

### Key Differences from Typeform:
- OAuth 2.0 (not simple API key)
- Rate limiting more strict
- Survey "pages" concept (not just fields)
- Bulk responses endpoint separate from single
- Built-in analytics endpoint
- Create/Modify requires approval for public apps

---

## Google Forms Implementation

### Base Class Needed
`src/providers/google-forms/google-forms-base.action.ts`

**Authentication**: OAuth 2.0 Bearer token (Google APIs)

### Actions to Implement (5 READ-ONLY)

**⚠️ LIMITATION**: Google Forms API does NOT support creating forms or submitting responses

1. **Get Google Forms Responses** → `get-responses.action.ts`
   - Endpoint: `GET /v1/forms/{formId}/responses`
   - Pagination: pageToken based
   - Filter: Not directly supported, must filter client-side

2. **Get Single Google Forms Response** → `get-single-response.action.ts`
   - Endpoint: `GET /v1/forms/{formId}/responses/{responseId}`

3. **Get Google Forms Response Statistics** → `get-statistics.action.ts`
   - Fetch all responses via list endpoint
   - Calculate statistics client-side

4. **Export Google Forms Responses to CSV** → `export-csv.action.ts`
   - Fetch responses, convert to CSV

5. **Watch for New Google Forms Responses** → `watch-new-responses.action.ts`
   - No native filtering by date
   - Must fetch all and compare timestamps client-side
   - Store last response ID for efficiency

### Actions NOT Implemented:
- ❌ Get Form Details - API doesn't provide form structure easily
- ❌ Create Form - NOT supported by official API
- ❌ Update Form - NOT supported by official API

### Key Differences from Typeform:
- OAuth 2.0 required
- READ-ONLY responses API
- No date filtering
- PageToken pagination (not offset)
- Cannot create/modify forms via API
- Responses are deeply nested JSON

### Workaround Documentation:
For form creation/management, users must:
- Use Google Apps Script
- Use unofficial formResponse endpoint (not recommended)
- Manually create forms in Google Forms UI

---

## Metadata Files Needed

### Action Categories
`metadata/action-categories/.formbuilders-categories.json` (already created, needs update)

Add:
- JotForm subcategory
- SurveyMonkey subcategory
- Google Forms subcategory

### Action Definitions

1. `metadata/actions/.formbuilders-jotform-actions.json` (8 actions)
2. `metadata/actions/.formbuilders-surveymonkey-actions.json` (8 actions)
3. `metadata/actions/.formbuilders-googleforms-actions.json` (5 actions)

---

## Package Updates Needed

### 1. Update Main Index
`src/index.ts` - Add exports for new providers

### 2. Provider Indexes
- `src/providers/jotform/index.ts`
- `src/providers/surveymonkey/index.ts`
- `src/providers/google-forms/index.ts`

### 3. Update README.md
- Move JotForm, SurveyMonkey, Google Forms from "Future" to "Implemented"
- Add Microsoft Forms note about lack of official API
- Update examples to show all three

### 4. Update package.json dependencies
May need additional deps:
- Already have `axios` ✅
- May need `@google-auth-library/oauth2client` for Google Forms
- SurveyMonkey and JotForm work with axios

---

## Implementation Priority

Given token/time constraints, recommend implementing in phases:

### Phase 1 (Current PR):
- ✅ Typeform (complete)
- ✅ JotForm base class
- ✅ Basic documentation

### Phase 2 (Next PR):
- JotForm 8 actions
- JotForm metadata
- Testing

### Phase 3 (Following PR):
- SurveyMonkey 8 actions
- SurveyMonkey metadata
- Testing

### Phase 4 (Final PR):
- Google Forms 5 actions
- Google Forms metadata
- Final README updates
- Integration testing

---

## Testing Checklist

For each provider, test:
- [ ] Authentication (API key / OAuth)
- [ ] Get responses with pagination
- [ ] Get single response
- [ ] Statistics calculation
- [ ] CSV export format
- [ ] Watch for new responses (polling logic)
- [ ] Form details retrieval
- [ ] Form creation (JotForm, SurveyMonkey only)
- [ ] Form updates (JotForm, SurveyMonkey only)
- [ ] Error handling
- [ ] Rate limit handling

---

## Code Generation Template

Each action should follow this structure:

```typescript
import { RegisterClass } from '@memberjunction/global';
import { [Provider]BaseAction } from '../[provider]-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

@RegisterClass(BaseAction, '[Action Name]')
export class [ActionClass] extends [Provider]BaseAction {
    public get Description(): string {
        return '[Description]';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // 1. Validate required params
            // 2. Extract input params
            // 3. Call base class API method
            // 4. Transform response
            // 5. Set output params
            // 6. Return success result
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('[Operation]', errorMessage, error)
            };
        }
    }

    public get Params(): ActionParam[] {
        return [
            // Input params
            // Output params
        ];
    }
}
```

---

## Next Steps

1. **Commit current work** (Typeform complete + JotForm base)
2. **Create PR** to get Typeform merged
3. **Implement JotForm actions** (separate PR)
4. **Implement SurveyMonkey** (separate PR)
5. **Implement Google Forms** (separate PR)

This phased approach allows for:
- Incremental code review
- Testing between phases
- Manageable PR sizes
- Early value delivery (Typeform usable immediately)
