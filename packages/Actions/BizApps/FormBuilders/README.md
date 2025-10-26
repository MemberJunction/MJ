# Form Builder Actions for MemberJunction

This package provides integration actions for popular form builder and survey platforms, enabling AI agents, workflows, and applications to programmatically interact with forms, retrieve responses, and analyze submission data.

## Supported Platforms

### ✅ Typeform (Implemented)
Complete integration with Typeform's Responses API and Create API.

### 🔜 Future Platforms

#### Google Forms
**Why**: Widely used free form builder integrated with Google Workspace
- Get form responses
- Export to Sheets
- Create forms programmatically
- Real-time response notifications

#### JotForm
**Why**: Popular enterprise form builder with advanced features
- Response management
- Conditional logic
- Payment integration
- Form templates

#### Microsoft Forms
**Why**: Seamless Microsoft 365 integration
- Forms and quizzes
- Excel export
- Teams integration
- Education features

#### SurveyMonkey
**Why**: Industry-leading survey platform
- Advanced analytics
- Survey templates
- Audience management
- Response analysis

#### Formstack
**Why**: Enterprise workflow automation
- Document generation
- Salesforce integration
- HIPAA compliance
- Advanced routing

#### Wufoo
**Why**: User-friendly with strong reporting
- Payment processing
- Report designer
- Entry management
- Custom themes

#### Typeform Alternatives
- **Tally** - Open-source, free alternative
- **Fillout** - Modern, flexible forms
- **Paperform** - Long-form capable

---

## Typeform Actions

### Response Actions

#### 1. Get Typeform Responses
Retrieve responses with comprehensive filtering options.

**Parameters:**
- `FormID` - Typeform form ID
- `APIToken` - Personal access token
- `PageSize` - Results per page (1-1000)
- `Since` / `Until` - Date range filters
- `Completed` - Filter by completion status
- `Sort` - Order results
- `Query` - Text search
- `GetAllPages` - Auto-paginate through all responses

**Use Cases:**
- Data analysis and reporting
- CRM integration
- Response monitoring
- Workflow triggers

---

#### 2. Get Single Typeform Response
Retrieve specific response by token.

**Parameters:**
- `FormID` - Form ID
- `ResponseToken` - Unique response identifier
- `APIToken` - Access token

**Use Cases:**
- Response lookup
- Detail verification
- Follow-up workflows

---

#### 3. Get Typeform Response Statistics
Calculate aggregate analytics from responses.

**Parameters:**
- `FormID` - Form ID
- `APIToken` - Access token
- `Since` / `Until` - Analysis date range
- `IncludeTopAnswers` - Popular answers analysis
- `MaxResponses` - Analysis limit

**Output:**
- Total/completed/partial counts
- Completion rate
- Daily/hourly distribution
- Popular answers by field

**Use Cases:**
- Dashboard reporting
- Form performance analysis
- A/B testing insights
- Trend identification

---

#### 4. Export Typeform Responses to CSV
Convert responses to CSV format.

**Parameters:**
- `FormID` - Form ID
- `APIToken` - Access token
- `Since` / `Until` - Date range
- `IncludeMetadata` - Include browser/platform data
- `Delimiter` - CSV separator

**Use Cases:**
- Excel/Google Sheets import
- Data archival
- Third-party tool integration
- Backup creation

---

#### 5. Watch for New Typeform Responses
Poll for new submissions since last check.

**Parameters:**
- `FormID` - Form ID
- `APIToken` - Access token
- `LastCheckedTimestamp` - Previous check time
- `OnlyCompleted` - Filter partial responses

**Use Cases:**
- Real-time notifications
- Workflow automation
- Auto-responders
- CRM sync triggers

---

### Form Management Actions

#### 6. Get Typeform Details
Retrieve complete form configuration.

**Parameters:**
- `FormID` - Form ID
- `APIToken` - Access token

**Output:**
- Title, fields, settings
- Logic jumps
- Theme configuration
- Hidden fields
- Workspace info

**Use Cases:**
- Form backup
- Configuration inspection
- Template creation
- Migration prep

---

#### 7. Create Typeform
Create new forms programmatically.

**Parameters:**
- `APIToken` - Access token with create permissions
- `Title` - Form title
- `Fields` - Array of field definitions
- `Settings` - Form settings (optional)
- `Logic` - Conditional logic (optional)
- `ThemeID` - Visual theme (optional)
- `WorkspaceID` - Workspace assignment (optional)

**Field Types Supported:**
- `short_text`, `long_text`, `email`, `number`
- `dropdown`, `multiple_choice`, `yes_no`
- `rating`, `opinion_scale`, `date`
- `phone_number`, `website`, `file_upload`
- `payment`, `legal`, `matrix`, `ranking`, `picture_choice`

**Use Cases:**
- Dynamic form generation
- Template instantiation
- AI-generated surveys
- Event registration automation

---

#### 8. Update Typeform
Modify existing forms safely.

**Parameters:**
- `FormID` - Form to update
- `APIToken` - Access token
- `MergeWithExisting` - Safe update mode (default: true)
- `Title` - New title (optional)
- `Fields` - Updated fields (optional)
- `Settings` - Updated settings (optional)

**⚠️ Important:**
- `MergeWithExisting=true` - Fetches current form and merges changes (SAFE)
- `MergeWithExisting=false` - Replaces entire form (DANGEROUS - omitted fields are deleted)

**Use Cases:**
- Form title updates
- Adding/removing fields
- Settings adjustments
- Logic jump modifications

---

## Installation

```bash
npm install @memberjunction/actions-bizapps-formbuilders
```

## Authentication

### Typeform API Token

1. Go to https://admin.typeform.com/account#/section/tokens
2. Create a new personal access token
3. Grant required scopes:
   - `forms:read` - Read form responses
   - `forms:write` - Create/update forms
   - `responses:read` - Read form responses

### Environment Variables (Recommended)

```bash
export BIZAPPS_TYPEFORM_{COMPANY_ID}_API_TOKEN=tfp_...
```

### Database Configuration (Alternative)

Store tokens in `Company Integrations` table with Integration Name = "Typeform"

---

## Usage Examples

### Example 1: AI Agent Analyzing Survey Responses

```typescript
import { RunView } from '@memberjunction/core';
import { AIPromptRunner } from '@memberjunction/ai-prompts';

// Get recent responses
const getResponsesResult = await runAction({
  ActionName: 'Get Typeform Responses',
  Params: [
    { Name: 'FormID', Value: 'abc123' },
    { Name: 'APIToken', Value: 'tfp_...' },
    { Name: 'Since', Value: '2024-01-01T00:00:00Z' },
    { Name: 'GetAllPages', Value: true }
  ]
});

const responses = getResponsesResult.Params.find(p => p.Name === 'Responses').Value;

// AI analyzes sentiment
const aiResult = await promptRunner.ExecutePrompt({
  prompt: 'Analyze customer satisfaction from these survey responses',
  data: { responses }
});
```

### Example 2: Automated Form Creation

```typescript
// AI generates a customer feedback form
const formData = {
  title: 'Q1 2024 Customer Feedback Survey',
  fields: [
    {
      type: 'short_text',
      title: 'What is your name?',
      ref: 'name'
    },
    {
      type: 'email',
      title: 'What is your email address?',
      ref: 'email',
      validations: { required: true }
    },
    {
      type: 'rating',
      title: 'How satisfied are you with our product?',
      ref: 'satisfaction',
      properties: {
        steps: 5,
        shape: 'star'
      }
    },
    {
      type: 'long_text',
      title: 'What could we improve?',
      ref: 'feedback'
    }
  ],
  settings: {
    is_public: true,
    show_progress_bar: true,
    show_typeform_branding: false
  }
};

const result = await runAction({
  ActionName: 'Create Typeform',
  Params: [
    { Name: 'APIToken', Value: 'tfp_...' },
    { Name: 'Title', Value: formData.title },
    { Name: 'Fields', Value: formData.fields },
    { Name: 'Settings', Value: formData.settings }
  ]
});

const formUrl = result.Params.find(p => p.Name === 'FormURL').Value;
console.log(`Form created: ${formUrl}`);
```

### Example 3: Real-Time Response Monitoring

```typescript
// Check for new responses every 5 minutes
setInterval(async () => {
  const result = await runAction({
    ActionName: 'Watch for New Typeform Responses',
    Params: [
      { Name: 'FormID', Value: 'abc123' },
      { Name: 'APIToken', Value: 'tfp_...' },
      { Name: 'LastCheckedTimestamp', Value: lastChecked },
      { Name: 'OnlyCompleted', Value: true }
    ]
  });

  const newResponses = result.Params.find(p => p.Name === 'NewResponses').Value;
  const hasNewResponses = result.Params.find(p => p.Name === 'HasNewResponses').Value;

  if (hasNewResponses) {
    // Send notifications
    for (const response of newResponses) {
      await sendNotification({
        subject: 'New Form Submission',
        body: `Received response from ${response.responseId}`,
        data: response
      });
    }

    // Update last checked timestamp
    lastChecked = result.Params.find(p => p.Name === 'LastChecked').Value;
  }
}, 5 * 60 * 1000); // Every 5 minutes
```

### Example 4: Export and Analyze

```typescript
// Export responses to CSV
const exportResult = await runAction({
  ActionName: 'Export Typeform Responses to CSV',
  Params: [
    { Name: 'FormID', Value: 'abc123' },
    { Name: 'APIToken', Value: 'tfp_...' },
    { Name: 'Since', Value: '2024-01-01T00:00:00Z' },
    { Name: 'IncludeMetadata', Value: true }
  ]
});

const csvData = exportResult.Params.find(p => p.Name === 'CSVData').Value;

// Save to file storage
await fs.writeFile('responses.csv', csvData);

// Or get statistics
const statsResult = await runAction({
  ActionName: 'Get Typeform Response Statistics',
  Params: [
    { Name: 'FormID', Value: 'abc123' },
    { Name: 'APIToken', Value: 'tfp_...' },
    { Name: 'Since', Value: '2024-01-01T00:00:00Z' },
    { Name: 'IncludeTopAnswers', Value: true }
  ]
});

const stats = statsResult.Params.find(p => p.Name === 'Statistics').Value;
console.log(`Completion Rate: ${stats.completionRate}%`);
console.log(`Total Responses: ${stats.totalResponses}`);
```

---

## Error Handling

All actions return consistent error codes:

- `SUCCESS` - Operation completed
- `MISSING_FORM_ID` - FormID parameter required
- `MISSING_API_TOKEN` - APIToken parameter required
- `MISSING_CONTEXT_USER` - Context user required
- `ERROR` - General error (check Message for details)

Typeform-specific errors are automatically handled:
- 401 - Invalid API token
- 403 - Insufficient permissions
- 404 - Form/response not found
- 429 - Rate limit (automatic retry with backoff)

---

## Rate Limiting

Typeform API rate limits:
- Free plan: 100 requests/minute
- Basic plan: 200 requests/minute
- Plus/Business: Higher limits

The package automatically:
- Retries on 429 errors
- Respects `Retry-After` headers
- Implements exponential backoff

---

## Best Practices

### 1. Use GetAllPages Wisely
Only use `GetAllPages=true` when you need complete data. For large forms, consider:
- Date range filtering (`Since`/`Until`)
- Limiting with `MaxResponses`
- Pagination with `After`/`Before` tokens

### 2. Cache Form Details
Form structure changes infrequently. Cache the result of `Get Typeform Details` to avoid unnecessary API calls.

### 3. Update Forms Safely
Always use `MergeWithExisting=true` when updating forms unless you're intentionally replacing the entire form.

### 4. Monitor in Batches
When watching for new responses, use reasonable poll intervals:
- High-traffic forms: 1-5 minutes
- Low-traffic forms: 15-60 minutes

### 5. Export in Chunks
For large datasets, export responses in date ranges rather than all at once.

---

## Contributing

To add a new form platform:

1. Create provider directory: `src/providers/{platform}/`
2. Extend `BaseFormBuilderAction`
3. Implement platform-specific API client
4. Create actions for common operations
5. Add tests
6. Update this README

---

## License

ISC

---

## Support

- Documentation: https://docs.memberjunction.com
- GitHub Issues: https://github.com/MemberJunction/MJ/issues
- Typeform API Docs: https://developer.typeform.com
