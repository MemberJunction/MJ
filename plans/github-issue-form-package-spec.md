# GitHub Issue Form - Reusable Package Specification

## Implementation Status

✅ **Implemented** - The feedback system has been built and integrated into MJExplorer.

**Key implementation details:**
- Angular package: `packages/Angular/Generic/feedback/`
- Server resolver: `packages/MJServer/src/resolvers/FeedbackResolver.ts`
- Uses GraphQL mutation (not REST) via `SubmitFeedback`
- Tab-based context via `CurrentPageProvider` instead of URL capture
- Markdown sanitization to handle special characters in table cells

## Overview

A reusable package that provides consistent bug reporting and feedback functionality across all applications. Each app installs the package, configures it for their specific repo, and owns their own GitHub credentials.

**Key Benefits:**
- Consistent UI and UX across all applications
- Shared validation and formatting logic
- Each app is self-contained (no external service dependency)
- One codebase to maintain, updates propagate via package version

---

## Package Structure

```
@memberjunction/feedback/
├── src/
│   ├── angular/                    # Angular library
│   │   ├── feedback.module.ts
│   │   ├── feedback-form.component.ts
│   │   ├── feedback-form.component.html
│   │   ├── feedback-form.component.scss
│   │   ├── feedback.service.ts
│   │   ├── feedback.config.ts
│   │   └── index.ts
│   │
│   ├── server/                     # Node.js utilities
│   │   ├── handler.ts              # Express route handler
│   │   ├── github.ts               # GitHub API integration
│   │   ├── validation.ts           # Input validation
│   │   ├── types.ts                # Shared types
│   │   └── index.ts
│   │
│   └── shared/                     # Shared between frontend/backend
│       ├── types.ts
│       └── constants.ts
│
├── package.json
├── tsconfig.json
├── tsconfig.lib.json
└── README.md
```

---

## Form Fields

### Required Fields

| Field | Type | Validation | Purpose |
|-------|------|------------|---------|
| `title` | text | Required, max 256 chars | Issue title — clear, concise summary |
| `description` | textarea | Required, min 20 chars | Detailed explanation of the issue |
| `category` | select | Required | Determines issue labels and may show/hide conditional fields |

### Recommended Fields (Bug Reports)

| Field | Type | When Shown | Purpose |
|-------|------|------------|---------|
| `stepsToReproduce` | textarea | category = 'bug' | Numbered steps to recreate the issue |
| `expectedBehavior` | textarea | category = 'bug' | What should have happened |
| `actualBehavior` | textarea | category = 'bug' | What actually happened |
| `severity` | select | category = 'bug' | How severe is the impact (critical, major, minor, trivial) |

### Recommended Fields (Feature Requests)

| Field | Type | When Shown | Purpose |
|-------|------|------------|---------|
| `useCase` | textarea | category = 'feature' | Why is this needed? What problem does it solve? |
| `proposedSolution` | textarea | category = 'feature' | How might this work? (optional) |

### Optional Fields (All Categories)

| Field | Type | Purpose |
|-------|------|---------|
| `email` | email | Contact for follow-up questions |
| `name` | text | Submitter identification |
| `attachments` | file[] | Screenshots, screen recordings, logs |
| `environment` | select | Production, Staging, Development, Local |
| `affectedArea` | select | App-specific areas (e.g., Dashboard, Reports, Settings) |

### Auto-Captured Fields (No User Input)

| Field | Source | Purpose |
|-------|--------|---------|
| `currentPage` | `CurrentPageProvider` callback | Current view/tab name(s) for tab-based apps |
| `userAgent` | `navigator.userAgent` | Browser and OS info |
| `screenSize` | `window.innerWidth/Height` | Viewport dimensions |
| `timestamp` | Server | When submitted |
| `appVersion` | Config | Application version |
| `appName` | Config | Which application |
| `userId` | Auth context (optional) | If user is logged in |

> **Note**: URL capture was intentionally removed because MJExplorer and similar apps use tab-based navigation where the browser URL doesn't change during navigation. The `currentPage` field provides more meaningful context by showing which tabs/views the user has open.

---

## Field Configuration

Apps can customize which fields are shown:

```typescript
interface FeedbackFieldConfig {
  // Required fields (always shown, not configurable)
  // - title
  // - description  
  // - category

  // Bug-specific fields
  showStepsToReproduce?: boolean;      // default: true
  showExpectedBehavior?: boolean;       // default: true
  showActualBehavior?: boolean;         // default: true
  showSeverity?: boolean;               // default: true
  
  // Feature request fields
  showUseCase?: boolean;                // default: true
  showProposedSolution?: boolean;       // default: true
  
  // Optional fields
  showEmail?: boolean;                  // default: true
  showName?: boolean;                   // default: true
  showEnvironment?: boolean;            // default: false
  showAffectedArea?: boolean;           // default: false
  showAttachments?: boolean;            // default: false
  
  // Custom affected areas for this app
  affectedAreas?: string[];             // e.g., ['Dashboard', 'Reports', 'User Management']
  
  // Custom categories (overrides defaults)
  categories?: CategoryConfig[];
}

interface CategoryConfig {
  value: string;
  label: string;
  githubLabel: string;
  description?: string;
}
```

---

## Categories

### Default Categories

```typescript
const defaultCategories: CategoryConfig[] = [
  {
    value: 'bug',
    label: 'Bug Report',
    githubLabel: 'bug',
    description: 'Something isn\'t working correctly'
  },
  {
    value: 'feature',
    label: 'Feature Request',
    githubLabel: 'enhancement',
    description: 'Suggest a new feature or improvement'
  },
  {
    value: 'question',
    label: 'Question',
    githubLabel: 'question',
    description: 'Ask a question about functionality'
  },
  {
    value: 'other',
    label: 'Other',
    githubLabel: 'triage',
    description: 'Something else'
  }
];
```

### Severity Levels

```typescript
const severityLevels = [
  {
    value: 'critical',
    label: 'Critical',
    githubLabel: 'priority: critical',
    description: 'System down, data loss, no workaround'
  },
  {
    value: 'major',
    label: 'Major',
    githubLabel: 'priority: high',
    description: 'Major feature broken, difficult workaround'
  },
  {
    value: 'minor',
    label: 'Minor',
    githubLabel: 'priority: medium',
    description: 'Feature impaired but workaround exists'
  },
  {
    value: 'trivial',
    label: 'Trivial',
    githubLabel: 'priority: low',
    description: 'Cosmetic issue, minor inconvenience'
  }
];
```

---

## Angular Library

### Module Configuration

```typescript
// feedback.config.ts
export interface FeedbackConfig {
  // Required
  apiEndpoint: string;                  // Your backend endpoint, e.g., '/api/feedback'
  
  // App identification
  appName: string;                      // e.g., 'MemberJunction Explorer'
  appVersion?: string;                  // e.g., '1.2.3'
  
  // Field configuration
  fields?: FeedbackFieldConfig;
  
  // UI customization
  title?: string;                       // Form title, default: 'Submit Feedback'
  subtitle?: string;                    // Form subtitle
  submitButtonText?: string;            // default: 'Submit'
  successMessage?: string;              // default: 'Thank you! Your feedback has been submitted.'
  showIssueLink?: boolean;              // Show link to created issue, default: true
  
  // Behavior
  captureScreenshot?: boolean;          // Prompt user to capture screenshot, default: false
  includeConsoleErrors?: boolean;       // Capture recent console errors, default: false
  maxAttachmentSize?: number;           // In bytes, default: 5MB
  maxAttachments?: number;              // default: 3
}
```

### Module Setup

```typescript
// In your app.module.ts or feature module
import { FeedbackModule } from '@memberjunction/feedback';

@NgModule({
  imports: [
    FeedbackModule.forRoot({
      apiEndpoint: '/api/feedback',
      appName: 'MemberJunction Explorer',
      appVersion: environment.version,
      fields: {
        showSeverity: true,
        showEnvironment: true,
        affectedAreas: ['Entities', 'Queries', 'Reports', 'Dashboards', 'Admin']
      }
    })
  ]
})
export class AppModule { }
```

### Component Usage

```html
<!-- Option 1: Full page -->
<mj-feedback-form></mj-feedback-form>

<!-- Option 2: In a dialog -->
<button (click)="openFeedbackDialog()">Report Issue</button>

<!-- Option 3: Floating button (always visible) -->
<mj-feedback-button position="bottom-right"></mj-feedback-button>

<!-- Option 4: Floating button with CurrentPageProvider for tab-based apps -->
<mj-feedback-button
  position="bottom-right"
  [CurrentPageProvider]="GetCurrentPage">
</mj-feedback-button>
```

#### CurrentPageProvider for Tab-Based Applications

For applications where the browser URL doesn't change during navigation (e.g., tab-based UIs), use the `CurrentPageProvider` input to provide meaningful context about where the user is:

```typescript
// In your app component
GetCurrentPage = (): string | undefined => {
  const config = this.workspaceManager.GetConfiguration();
  if (!config?.tabs?.length) {
    return undefined;
  }
  // Return all open tab names separated by " | "
  const titles = config.tabs.map(t => t.title).filter(Boolean);
  return titles.length > 0 ? titles.join(' | ') : undefined;
};
```

This provides context like "Actions Overview | Execution Monitoring" in the GitHub issue instead of a static URL.

### Component API

```typescript
// feedback-form.component.ts
@Component({
  selector: 'mj-feedback-form',
  templateUrl: './feedback-form.component.html',
  styleUrls: ['./feedback-form.component.scss']
})
export class FeedbackFormComponent {
  // Inputs
  @Input() prefilledCategory?: string;
  @Input() prefilledTitle?: string;
  @Input() contextData?: Record<string, any>;  // Additional data to include
  
  // Outputs
  @Output() submitted = new EventEmitter<FeedbackSubmission>();
  @Output() success = new EventEmitter<FeedbackResponse>();
  @Output() error = new EventEmitter<Error>();
  @Output() cancelled = new EventEmitter<void>();
  
  // Methods
  reset(): void;
  submit(): void;
}
```

### Service API

```typescript
// feedback.service.ts
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  // Submit feedback programmatically
  submit(data: FeedbackSubmission): Observable<FeedbackResponse>;
  
  // Get current configuration
  getConfig(): FeedbackConfig;
  
  // Open feedback dialog (if using dialog mode)
  openDialog(options?: DialogOptions): Observable<FeedbackResponse | null>;
}
```

---

## Server Utilities

### Express Handler

```typescript
// handler.ts
import { Router, Request, Response } from 'express';
import { Octokit } from '@octokit/rest';

export interface FeedbackHandlerConfig {
  // GitHub settings
  owner: string;                        // GitHub org or username
  repo: string;                         // Repository name
  token: string;                        // GitHub PAT or App token
  
  // Labels
  defaultLabels?: string[];             // Applied to all issues
  categoryLabels?: Record<string, string>;  // category value → GitHub label
  severityLabels?: Record<string, string>;  // severity value → GitHub label
  
  // Optional
  assignees?: string[];                 // Auto-assign issues
  projectId?: number;                   // Add to GitHub project
  
  // Rate limiting
  rateLimit?: {
    windowMs: number;                   // Time window in ms
    maxRequests: number;                // Max requests per window per IP
  };
  
  // Hooks
  beforeCreate?: (data: FeedbackSubmission, req: Request) => Promise<FeedbackSubmission | null>;
  afterCreate?: (issue: GitHubIssue, data: FeedbackSubmission) => Promise<void>;
}

export function createFeedbackHandler(config: FeedbackHandlerConfig): Router;
```

### Usage in Express App

```typescript
// server.ts or routes/feedback.ts
import express from 'express';
import { createFeedbackHandler } from '@memberjunction/feedback/server';

const app = express();

app.use('/api/feedback', createFeedbackHandler({
  owner: 'MemberJunction',
  repo: 'MJ',
  token: process.env.GITHUB_PAT!,
  defaultLabels: ['user-submitted', 'explorer'],
  categoryLabels: {
    bug: 'bug',
    feature: 'enhancement',
    question: 'question',
    other: 'triage'
  },
  severityLabels: {
    critical: 'priority: critical',
    major: 'priority: high',
    minor: 'priority: medium',
    trivial: 'priority: low'
  },
  rateLimit: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 10
  }
}));
```

### Issue Body Template

Generated issue body format:

```markdown
## Description
[User's description]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happened]

---

### Submission Details

| Field | Value |
|-------|-------|
| **App** | MemberJunction Explorer v1.2.3 |
| **Category** | Bug Report |
| **Severity** | Major |
| **Environment** | Production |
| **Affected Area** | Reports |
| **Submitted** | 2025-01-21T14:30:00Z |

### Contact
Jane Doe — jane@example.com

### Technical Details

| Field | Value |
|-------|-------|
| **Current Page** | Actions Overview \| Execution Monitoring |
| **Browser** | Chrome 120.0.0 on Windows 10 |
| **Screen Size** | 1920x1080 |
| **User ID** | user_abc123 |
```

> **Note**: Pipe characters (`|`) in field values are escaped (`\|`) to prevent breaking the markdown table format.

---

## Types

```typescript
// shared/types.ts

export interface FeedbackSubmission {
  // Required
  title: string;
  description: string;
  category: 'bug' | 'feature' | 'question' | 'other' | string;
  
  // Bug-specific
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  severity?: 'critical' | 'major' | 'minor' | 'trivial';
  
  // Feature-specific
  useCase?: string;
  proposedSolution?: string;
  
  // Optional
  email?: string;
  name?: string;
  environment?: 'production' | 'staging' | 'development' | 'local';
  affectedArea?: string;
  
  // Auto-captured
  currentPage?: string;      // Tab/view names for tab-based apps
  userAgent?: string;
  screenSize?: string;
  appName?: string;
  appVersion?: string;
  userId?: string;
  
  // Attachments (if supported)
  attachments?: Attachment[];
  
  // Custom data
  metadata?: Record<string, any>;
}

export interface Attachment {
  name: string;
  type: string;
  size: number;
  data: string;  // Base64 encoded
}

export interface FeedbackResponse {
  success: boolean;
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
}
```

---

## Validation Rules

```typescript
// shared/validation.ts

export const validationRules = {
  title: {
    required: true,
    minLength: 5,
    maxLength: 256,
    pattern: null
  },
  description: {
    required: true,
    minLength: 20,
    maxLength: 10000,
    pattern: null
  },
  email: {
    required: false,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  stepsToReproduce: {
    required: false,  // Required when category is 'bug' based on config
    minLength: 10,
    maxLength: 5000
  },
  attachment: {
    maxSize: 5 * 1024 * 1024,  // 5MB
    allowedTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
  }
};
```

---

## Security Considerations

### Frontend
- Sanitize all inputs before display
- Validate file types and sizes client-side (defense in depth)
- Don't expose any configuration that includes tokens

### Backend
- **Never trust client input** — validate everything server-side
- Store GitHub token in environment variables only
- Rate limit by IP address
- Sanitize markdown in issue body to prevent injection
- Validate file attachments (type, size, content)
- Log submissions (without PII) for abuse detection

### Markdown Sanitization

The `sanitizeMarkdown()` function escapes special characters that could break GitHub issue formatting:

```typescript
private sanitizeMarkdown(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')       // HTML entities
    .replace(/</g, '&lt;')        // Prevent HTML injection
    .replace(/>/g, '&gt;')
    .replace(/\[/g, '\\[')        // Escape markdown links
    .replace(/\]/g, '\\]')
    .replace(/!\[/g, '!\\[')      // Escape markdown images
    .replace(/\|/g, '\\|');       // Escape pipe chars (breaks tables)
}
```

The pipe character (`|`) escaping is particularly important for the `currentPage` field when multiple tab names are joined with ` | ` — without escaping, the markdown table would be corrupted.

### GitHub Token Permissions
- Use fine-grained PAT with minimal permissions:
  - `issues: write` on specific repo only
  - No other permissions needed

---

## Installation & Setup

### 1. Install Package

```bash
npm install @memberjunction/feedback
```

### 2. Frontend Setup (Angular)

```typescript
// app.module.ts
import { FeedbackModule } from '@memberjunction/feedback';

@NgModule({
  imports: [
    FeedbackModule.forRoot({
      apiEndpoint: '/api/feedback',
      appName: 'My Application',
      appVersion: '1.0.0'
    })
  ]
})
export class AppModule { }
```

### 3. Backend Setup (Express)

```typescript
// server.ts
import { createFeedbackHandler } from '@memberjunction/feedback/server';

app.use('/api/feedback', createFeedbackHandler({
  owner: 'YourOrg',
  repo: 'your-repo',
  token: process.env.GITHUB_PAT!,
  defaultLabels: ['user-submitted']
}));
```

### 4. Add to Template

```html
<!-- Simple usage -->
<mj-feedback-form></mj-feedback-form>

<!-- Or as a floating button -->
<mj-feedback-button></mj-feedback-button>
```

### 5. Create GitHub PAT

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Generate new token:
   - Repository access: Select your repo
   - Permissions: Issues → Read and Write
3. Add to your environment: `GITHUB_PAT=ghp_xxx...`

---

## Example Configurations

### MemberJunction Explorer

```typescript
// Frontend
FeedbackModule.forRoot({
  apiEndpoint: '/api/feedback',
  appName: 'MemberJunction Explorer',
  appVersion: environment.version,
  fields: {
    showSeverity: true,
    showEnvironment: true,
    affectedAreas: [
      'Entities',
      'Views', 
      'Queries',
      'Reports',
      'Dashboards',
      'User Management',
      'Admin Settings',
      'Navigation',
      'Search',
      'Other'
    ]
  },
  title: 'Report an Issue',
  subtitle: 'Help us improve MemberJunction Explorer'
})

// Backend
createFeedbackHandler({
  owner: 'MemberJunction',
  repo: 'MJ',
  token: process.env.GITHUB_PAT!,
  defaultLabels: ['user-submitted', 'explorer'],
  assignees: ['maintainer-username']
})
```

### Sidecar Learning Hub

```typescript
// Frontend
FeedbackModule.forRoot({
  apiEndpoint: '/api/feedback',
  appName: 'Sidecar Learning Hub',
  appVersion: environment.version,
  fields: {
    showSeverity: true,
    affectedAreas: [
      'Video Player',
      'Course Navigation',
      'Resource Library',
      'Search',
      'User Profile',
      'Certificates',
      'Other'
    ]
  }
})

// Backend
createFeedbackHandler({
  owner: 'YourOrg',
  repo: 'sidecar-hub',
  token: process.env.GITHUB_PAT!,
  defaultLabels: ['user-submitted']
})
```

---

## Development

### Building the Package

```bash
# Install dependencies
npm install

# Build Angular library
npm run build:angular

# Build server utilities  
npm run build:server

# Build all
npm run build

# Run tests
npm test

# Publish
npm publish
```

### Local Development

```bash
# Link package locally
npm link

# In your app
npm link @memberjunction/feedback
```

---

---

## Migration to MJ GraphQL Patterns

The current implementation uses Express REST endpoints. To align with MemberJunction's standard patterns, migrate to GraphQL resolvers.

### Why Migrate?

| Express (Current) | GraphQL (MJ Standard) |
|-------------------|----------------------|
| Separate REST endpoint | Single `/graphql` endpoint |
| IP-based rate limiting | User/context-based limiting |
| Manual CORS handling | Built-in GraphQL CORS |
| Isolated middleware | Integrated with MJ resolvers |
| HttpClient in Angular | Apollo client with typed queries |

### Changes Required

#### 1. Create GraphQL Resolver

**New File**: `packages/MJServer/src/resolvers/FeedbackResolver.ts`

```typescript
import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, InputType } from 'type-graphql';
import { AppContext } from '../types';

@InputType()
export class SubmitFeedbackInput {
  @Field()
  title: string;

  @Field()
  description: string;

  @Field()
  category: string;

  @Field({ nullable: true })
  stepsToReproduce?: string;

  @Field({ nullable: true })
  expectedBehavior?: string;

  @Field({ nullable: true })
  actualBehavior?: string;

  @Field({ nullable: true })
  severity?: string;

  @Field({ nullable: true })
  useCase?: string;

  @Field({ nullable: true })
  proposedSolution?: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  environment?: string;

  @Field({ nullable: true })
  affectedArea?: string;

  @Field({ nullable: true })
  currentPage?: string;

  @Field({ nullable: true })
  userAgent?: string;

  @Field({ nullable: true })
  screenSize?: string;

  @Field({ nullable: true })
  appName?: string;

  @Field({ nullable: true })
  appVersion?: string;
}

@ObjectType()
export class FeedbackResponseType {
  @Field()
  success: boolean;

  @Field({ nullable: true })
  issueNumber?: number;

  @Field({ nullable: true })
  issueUrl?: string;

  @Field({ nullable: true })
  error?: string;
}

@Resolver()
export class FeedbackResolver {
  @Mutation(() => FeedbackResponseType)
  async SubmitFeedback(
    @Arg('input') input: SubmitFeedbackInput,
    @Ctx() ctx: AppContext
  ): Promise<FeedbackResponseType> {
    const feedbackService = new FeedbackService();
    return feedbackService.submitFeedback(input, ctx.userPayload?.userRecord);
  }
}
```

#### 2. Create Feedback Service (Server-Side)

**New File**: `packages/MJServer/src/services/FeedbackService.ts`

Move and adapt from FeedbackServer package:
- `createGitHubIssue()` - GitHub API integration
- `formatIssueBody()` - Issue body formatting
- `buildLabels()` - Label construction
- `sanitizeMarkdown()` - Input sanitization
- `parseUserAgent()` - Browser/OS parsing

```typescript
import { Octokit } from '@octokit/rest';
import { UserInfo } from '@memberjunction/core';

export class FeedbackService {
  private octokit: Octokit;
  private config: FeedbackServerConfig;

  constructor() {
    this.config = this.loadConfig();
    this.octokit = new Octokit({ auth: this.config.github.token });
  }

  async submitFeedback(
    input: SubmitFeedbackInput,
    user?: UserInfo
  ): Promise<FeedbackResponseType> {
    // Validate input
    // Format issue body
    // Create GitHub issue
    // Return response
  }

  private loadConfig(): FeedbackServerConfig {
    // Load from mj.config.cjs or environment
  }
}
```

#### 3. Update Angular Service

**File**: `packages/Angular/Generic/feedback/src/lib/services/feedback.service.ts`

```typescript
import { Apollo, gql } from 'apollo-angular';

const SUBMIT_FEEDBACK = gql`
  mutation SubmitFeedback($input: SubmitFeedbackInput!) {
    SubmitFeedback(input: $input) {
      success
      issueNumber
      issueUrl
      error
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  constructor(private apollo: Apollo) {}

  Submit(data: FeedbackSubmission): Observable<FeedbackResponse> {
    return this.apollo.mutate<{ SubmitFeedback: FeedbackResponse }>({
      mutation: SUBMIT_FEEDBACK,
      variables: { input: this.enrichData(data) }
    }).pipe(
      map(result => result.data?.SubmitFeedback || { success: false, error: 'No response' })
    );
  }
}
```

#### 4. Server Configuration

Add to `mj.config.cjs`:

```javascript
module.exports = {
  // ... existing config
  feedbackSettings: {
    github: {
      owner: process.env.GITHUB_FEEDBACK_OWNER || 'MemberJunction',
      repo: process.env.GITHUB_FEEDBACK_REPO || 'MJ',
      token: process.env.GITHUB_PAT,
      defaultLabels: ['user-submitted'],
      categoryLabels: {
        bug: 'bug',
        feature: 'enhancement',
        question: 'question',
        other: 'triage'
      },
      severityLabels: {
        critical: 'priority: critical',
        major: 'priority: high',
        minor: 'priority: medium',
        trivial: 'priority: low'
      }
    },
    rateLimit: {
      maxRequestsPerHour: 10
    }
  }
};
```

#### 5. Files to Delete

After migration, remove:
- `packages/FeedbackServer/` - entire package
- `packages/MJAPI/src/index.ts` - remove Express middleware mount

### Code Reuse

These components from FeedbackServer are well-implemented and move to MJServer:

| File | Destination | Changes |
|------|-------------|---------|
| `types.ts` | `FeedbackService.ts` | Adapt for TypeGraphQL |
| `validation.ts` | `FeedbackService.ts` | Keep Zod for runtime validation |
| `issue-formatter.ts` | `FeedbackService.ts` | No changes |
| `github.ts` | `FeedbackService.ts` | No changes |
| `rate-limiter.ts` | Remove | Use user-based limiting instead |

### Verification Steps

1. **Build**: `npm run build` in MJServer and Angular feedback packages
2. **Test GraphQL Playground**:
   ```graphql
   mutation {
     SubmitFeedback(input: {
       title: "Test issue"
       description: "Testing the feedback system migration"
       category: "bug"
     }) {
       success
       issueNumber
       issueUrl
     }
   }
   ```
3. **Test Angular UI**: Open Explorer, click feedback button, submit form
4. **Verify GitHub**: Confirm issue created with correct labels

---

## Future Enhancements

- **Screenshot capture:** Integrate html2canvas for automatic screenshots
- **Screen recording:** Short video clips of the issue
- **Console log capture:** Include recent errors automatically
- **Offline support:** Queue submissions when offline
- **Analytics:** Track submission patterns, common issues
- **Duplicate detection:** Search existing issues before submission
- **Slack/Teams integration:** Notify team on critical issues
- **Custom themes:** Allow apps to fully customize styling
- **Localization:** Multi-language support
- **GitHub App auth:** Package-level support for GitHub App tokens
