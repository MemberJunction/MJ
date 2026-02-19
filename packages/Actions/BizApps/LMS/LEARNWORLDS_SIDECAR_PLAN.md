# LearnWorlds Sidecar Integration Plan

## Executive Summary

This document details the plan for building a "sidecar" integration with LearnWorlds (LW) where MemberJunction (MJ) owns the checkout and authentication flow, and LearnWorlds serves as the course delivery platform. The two primary objectives are:

1. **Onboarding Flow**: Stripe checkout → Auth0 account creation → LW user provisioning + enrollment → immediate redirect into LW (no password-reset email)
2. **Recurring Data Sync**: Pull learner progress, enrollment status, certificates, and other data from LW into local MJ database entities on a scheduled basis

---

## Part 1: Onboarding Flow

### 1.1 End-to-End User Journey

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER JOURNEY                                     │
│                                                                         │
│  1. User lands on signup/purchase page                                  │
│  2. Stripe Checkout form collects payment + email                       │
│  3. Stripe payment succeeds → webhook fires                             │
│  4. Page shows Auth0 Universal Login widget                             │
│     └─ If user already has Auth0 account → they log in                  │
│     └─ If new user → they create Auth0 account (email prefilled)        │
│  5. Auth0 callback returns to our app with auth token                   │
│  6. Our app calls backend "Onboard Learner" endpoint                    │
│     └─ Backend binds Auth0 user to Stripe transaction                   │
│     └─ Backend creates user in LW (if not exists)                       │
│     └─ Backend enrolls user in purchased course(s)                      │
│     └─ Backend generates SSO login URL from LW                          │
│  7. User is immediately redirected to LW school (auto-logged in)        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Why This Flow (vs. Password Reset Email)

The password-reset-email approach has several problems:
- **Friction**: User has to check email, click link, set password, then log in — multiple steps where they can drop off
- **Deliverability**: Emails can land in spam, be delayed, or get blocked by corporate filters
- **Timing**: User just paid and is motivated NOW — making them wait kills momentum
- **Clunkiness**: LW's password-reset flow is designed for forgotten-password scenarios, not onboarding

The Auth0 widget approach solves all of these:
- **Immediate access**: User creates account and is redirected to LW in one smooth flow
- **Auth0 is already our IdP**: We use Auth0 for SSO with LW, so the infrastructure exists
- **Binding is clean**: Auth0 account ↔ Stripe transaction ↔ LW user are all linked by email
- **No LW auth dependency**: We never rely on LW's own authentication — Auth0 is the single source of truth

### 1.3 Architecture Decision: Service Class (Not Agent, Not Composite Action)

Per MJ's Actions design philosophy, the onboarding orchestration should be built as a **service class** with a thin **Action wrapper** for discoverability. Here's why:

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **AI Agent** | Can reason about edge cases, adapt | Overkill for deterministic flow, slow, expensive (LLM calls), non-deterministic | No |
| **Composite Action (Action calling Actions)** | Reuses existing actions | Violates MJ's "no action-to-action calls" rule, loses type safety | No |
| **Service class + Action wrapper** | Type-safe, fast, testable, follows MJ patterns | Need to write the service class | **Yes** |
| **Standalone code (no Action)** | Simplest | Not discoverable by agents/workflows | Partial — still wrap in Action |

**Recommendation**: Build a `LearnWorldsOnboardingService` class that directly uses the LW API (via the existing `makeLearnWorldsRequest` patterns), and expose it through a thin `OnboardLearnerAction` for workflow/agent discoverability.

For the **scheduled sync**, use the existing `ScheduledJob` infrastructure with an `ActionScheduledJobDriver` pointing to a `SyncLearnWorldsDataAction`.

### 1.4 Detailed Onboarding Flow — Technical Sequence

```
Frontend (Angular)                    Backend (MJAPI)                    External Services
─────────────────                    ───────────────                    ─────────────────

1. Show Stripe Checkout
   ─── Stripe.js ───────────────────────────────────────────────────── Stripe
   Payment succeeds
   Stripe returns payment_intent.id
   and customer email

2. Show Auth0 Universal Login
   (email prefilled from Stripe)
   ─── Auth0 SDK ──────────────────────────────────────────────────── Auth0
   User logs in OR creates account
   Auth0 returns ID token + user info

3. POST /api/onboard-learner
   {
     stripePaymentIntentId,
     auth0UserId,
     email,
     firstName, lastName,
     courseIds[]
   }
                                     4. Validate Stripe payment
                                        ─── Stripe API ─────────────── Stripe
                                        Confirm payment_intent is paid
                                        Extract purchased product IDs

                                     5. Create/find LW user
                                        ─── LW API ─────────────────── LearnWorlds
                                        POST /v2/users (if new)
                                        GET /v2/users?email= (if exists)

                                     6. Enroll in course(s)
                                        ─── LW API ─────────────────── LearnWorlds
                                        POST /v2/courses/{id}/enrollments

                                     7. Generate SSO login URL
                                        ─── LW API ─────────────────── LearnWorlds
                                        POST /v2/sso
                                        { email, redirect_to: course_url }
                                        Returns: { url, user_id }

                                     8. Store onboarding record
                                        ─── MJ DB ──────────────────── SQL Server
                                        LW_Onboarding entity record

                                     9. Return SSO URL to frontend

10. window.location.href = ssoUrl
    User lands in LW, auto-logged in,
    on the course they purchased
```

### 1.5 New Components to Build

#### 1.5.1 SSO Action (`sso-login.action.ts`)

**LW API Endpoint**: `POST /v2/sso`

```typescript
// New action: Generate SSO login URL
@RegisterClass(BaseAction, 'LearnWorldsSSOLoginAction')
export class LearnWorldsSSOLoginAction extends LearnWorldsBaseAction {
    // Input params:
    //   - CompanyID (required)
    //   - Email (required) — OR — UserID (required)
    //   - RedirectTo (optional) — URL to land on after login
    //
    // Output params:
    //   - LoginURL — the auto-login URL to redirect the user to
    //   - LearnWorldsUserID — the LW user_id returned
    //
    // LW API call:
    //   POST /v2/sso
    //   Body: { email, redirect_to } or { user_id, redirect_to }
    //   Response: { url: string, user_id: string }
}
```

#### 1.5.2 Update User Action (`update-user.action.ts`)

**LW API Endpoint**: `PUT /v2/users/{userId}`

```typescript
// New action: Update existing LW user
@RegisterClass(BaseAction, 'UpdateLearnWorldsUserAction')
export class UpdateLearnWorldsUserAction extends LearnWorldsBaseAction {
    // Input params:
    //   - CompanyID (required)
    //   - UserID (required) — LW user ID
    //   - Email, FirstName, LastName, Username, Role, IsActive, Tags, CustomFields (all optional)
    //
    // Output params:
    //   - UserDetails — updated user object
    //
    // LW API call:
    //   PUT /v2/users/{userId}
    //   Body: { email?, first_name?, last_name?, username?, role?, is_active?, tags?, custom_fields? }
}
```

#### 1.5.3 Tag Management Actions

**LW API Endpoints**: `POST /v2/users/{userId}/tags`, `DELETE /v2/users/{userId}/tags`

```typescript
// New actions: Attach/detach tags
@RegisterClass(BaseAction, 'AttachLearnWorldsTagsAction')
export class AttachLearnWorldsTagsAction extends LearnWorldsBaseAction { ... }

@RegisterClass(BaseAction, 'DetachLearnWorldsTagsAction')
export class DetachLearnWorldsTagsAction extends LearnWorldsBaseAction { ... }
```

#### 1.5.4 Onboarding Service Class

```typescript
// NOT an action — direct service class for code-to-code orchestration
export class LearnWorldsOnboardingService {
    constructor(
        private companyId: string,
        private contextUser: UserInfo
    ) {}

    /**
     * Full onboarding flow:
     * 1. Validate Stripe payment
     * 2. Find or create LW user
     * 3. Enroll in purchased courses
     * 4. Generate SSO login URL
     * 5. Record onboarding in MJ DB
     */
    public async OnboardLearner(params: OnboardLearnerParams): Promise<OnboardLearnerResult> {
        const stripePayment = await this.validateStripePayment(params.StripePaymentIntentId);
        const lwUser = await this.findOrCreateLearnWorldsUser(params);
        const enrollments = await this.enrollInCourses(lwUser.Id, params.CourseIds);
        const ssoResult = await this.generateSSOLoginUrl(lwUser.Email, params.RedirectTo);
        await this.recordOnboarding(params, lwUser, enrollments, stripePayment);

        return {
            Success: true,
            LoginURL: ssoResult.Url,
            LearnWorldsUserId: lwUser.Id,
            Enrollments: enrollments
        };
    }

    // Internal methods use LW API directly (not through Actions)
    private async findOrCreateLearnWorldsUser(...) { ... }
    private async enrollInCourses(...) { ... }
    private async generateSSOLoginUrl(...) { ... }
    private async validateStripePayment(...) { ... }
    private async recordOnboarding(...) { ... }
}
```

#### 1.5.5 Onboard Learner Action (Thin Wrapper)

```typescript
// Thin Action wrapper for workflow/agent discoverability
@RegisterClass(BaseAction, 'OnboardLearnerAction')
export class OnboardLearnerAction extends LearnWorldsBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const service = new LearnWorldsOnboardingService(companyId, params.ContextUser);
        const result = await service.OnboardLearner({
            StripePaymentIntentId: this.getParamValue(params.Params, 'StripePaymentIntentId'),
            Email: this.getParamValue(params.Params, 'Email'),
            // ...
        });
        // Map result to ActionResultSimple
    }
}
```

#### 1.5.6 REST Endpoint for Frontend

```typescript
// Custom REST endpoint in MJAPI for the frontend to call
// POST /api/onboard-learner
// This is NOT a webhook — it's a direct API call from the authenticated frontend
app.post('/api/onboard-learner', authenticateJWT, async (req, res) => {
    const { stripePaymentIntentId, courseIds, redirectTo } = req.body;

    // contextUser comes from the Auth0 JWT token
    const contextUser = req.user;

    const service = new LearnWorldsOnboardingService(companyId, contextUser);
    const result = await service.OnboardLearner({
        StripePaymentIntentId: stripePaymentIntentId,
        Email: contextUser.Email,
        FirstName: contextUser.FirstName,
        LastName: contextUser.LastName,
        CourseIds: courseIds,
        RedirectTo: redirectTo
    });

    res.json({
        success: result.Success,
        loginUrl: result.LoginURL,
        enrollments: result.Enrollments
    });
});
```

### 1.6 Frontend Component

The signup/purchase page needs a component that orchestrates:

1. **Stripe Checkout** — embedded form or Stripe Checkout Session redirect
2. **Auth0 Widget** — shown after payment succeeds, with email prefilled
3. **Onboarding Call** — POST to `/api/onboard-learner` after Auth0 login
4. **Redirect** — `window.location.href = loginUrl` to send user to LW

```typescript
// Simplified flow in Angular component
@Component({ ... })
export class CourseCheckoutComponent {
    async onStripePaymentSuccess(paymentIntent: { id: string; email: string }) {
        // Store payment info
        this.stripePaymentIntentId = paymentIntent.id;
        this.userEmail = paymentIntent.email;

        // Show Auth0 login/signup widget with email prefilled
        this.showAuth0Widget = true;
    }

    async onAuth0LoginSuccess(auth0User: { sub: string; email: string }) {
        // Call onboarding endpoint
        const result = await this.http.post('/api/onboard-learner', {
            stripePaymentIntentId: this.stripePaymentIntentId,
            courseIds: this.selectedCourseIds,
            redirectTo: `/course/${this.selectedCourseIds[0]}`
        }).toPromise();

        // Redirect to LearnWorlds
        if (result.success && result.loginUrl) {
            window.location.href = result.loginUrl;
        }
    }
}
```

### 1.7 Edge Cases and Error Handling

| Scenario | Handling |
|----------|----------|
| **User already exists in LW** | `findOrCreateLearnWorldsUser` does GET by email first; if found, uses existing user |
| **User already enrolled** | LW API returns enrollment details; we skip re-enrollment and proceed to SSO |
| **Stripe payment not found/not paid** | Return error before creating LW user — no partial state |
| **LW user creation fails** | Return error with details; Stripe payment is still valid (can retry) |
| **SSO URL generation fails** | Fall back to LW's `login_url` from user creation response |
| **Auth0 account exists but LW doesn't** | Normal flow — create LW user, enroll, generate SSO |
| **User closes browser after Stripe, before Auth0** | Stripe payment exists but no LW user; handle in reconciliation sync job |
| **LW API rate limiting** | Exponential backoff retry in `makeLearnWorldsRequest`; surface error if exhausted |

### 1.8 Data Model: Onboarding Record

A new MJ entity to track the binding between Stripe, Auth0, and LW:

```
LW Learner Onboarding
├── ID (PK)
├── Email
├── Auth0UserID
├── StripePaymentIntentID
├── StripeCustomerID
├── LearnWorldsUserID
├── CompanyID (FK → Companies)
├── Status ('pending' | 'completed' | 'failed' | 'partial')
├── ErrorMessage (nullable)
├── CourseIDs (JSON array of enrolled course IDs)
├── SSOLoginURL (the generated login URL)
├── OnboardedAt (timestamp when fully completed)
├── Notes
```

---

## Part 2: Recurring Data Sync

### 2.1 Purpose

Pull data from LearnWorlds into local MJ database entities on a regular schedule so that:
- Dashboards and reports can query local data without hitting LW API
- Cross-referencing LW data with other MJ entities (CRM contacts, Stripe payments, etc.) is possible
- Historical trend analysis is available
- AI agents and actions can access learner data without API calls

### 2.2 Architecture: Scheduled Job + Sync Action

MJ already has a production-ready scheduled job engine (`SchedulingEngine`) with:
- Cron-based scheduling
- Distributed locking (multi-server safe)
- Run tracking and notification
- Two drivers: `ActionScheduledJobDriver` and `AgentScheduledJobDriver`

**We'll use `ActionScheduledJobDriver`** pointing to a `SyncLearnWorldsDataAction` that runs a `LearnWorldsSyncService` class.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SCHEDULED SYNC ARCHITECTURE                       │
│                                                                      │
│  SchedulingEngine (polling)                                          │
│       │                                                              │
│       ▼                                                              │
│  ScheduledJob: "Sync LW Data - Every 6 Hours"                       │
│       │  CronExpression: "0 0 */6 * * *"                             │
│       │  JobType: ActionScheduledJobDriver                           │
│       │                                                              │
│       ▼                                                              │
│  SyncLearnWorldsDataAction (thin wrapper)                            │
│       │                                                              │
│       ▼                                                              │
│  LearnWorldsSyncService (business logic)                             │
│       │                                                              │
│       ├─► Sync Users:  GET /v2/users → upsert LW_User              │
│       ├─► Sync Enrollments: GET /v2/users/{id}/enrollments          │
│       │                     → upsert LW_Enrollment                   │
│       ├─► Sync Progress: GET /v2/users/{id}/courses/{id}/progress   │
│       │                  → upsert LW_CourseProgress                  │
│       ├─► Sync Courses:  GET /v2/courses → upsert LW_Course        │
│       └─► Sync Certificates: per user → upsert LW_Certificate      │
│                                                                      │
│  Run tracking: ScheduledJobRun entity records each execution         │
│  Error handling: Partial failures logged, job continues               │
│  Delta sync: Track last sync timestamp, only pull changed records    │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Local Database Entities

New MJ entities to store synced LW data:

#### `LW Users`
| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier | MJ primary key |
| CompanyID | uniqueidentifier | FK → Companies |
| LearnWorldsUserID | nvarchar(100) | LW's internal user ID |
| Email | nvarchar(255) | |
| Username | nvarchar(255) | |
| FirstName | nvarchar(255) | |
| LastName | nvarchar(255) | |
| FullName | nvarchar(500) | |
| Status | nvarchar(50) | active, inactive, suspended |
| Role | nvarchar(50) | student, instructor, admin |
| AvatarURL | nvarchar(1000) | |
| Tags | nvarchar(max) | JSON array |
| CustomFields | nvarchar(max) | JSON object |
| LWCreatedAt | datetimeoffset | When created in LW |
| LastLoginAt | datetimeoffset | |
| LastActivityAt | datetimeoffset | |
| TotalCertificates | int | |
| TotalBadges | int | |
| Points | int | |
| LastSyncedAt | datetimeoffset | When we last pulled this record |

#### `LW Courses`
| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier | MJ primary key |
| CompanyID | uniqueidentifier | FK → Companies |
| LearnWorldsCourseID | nvarchar(100) | LW's internal course ID |
| Title | nvarchar(500) | |
| Description | nvarchar(max) | |
| ShortDescription | nvarchar(1000) | |
| Status | nvarchar(50) | draft, published, archived |
| Level | nvarchar(50) | |
| Language | nvarchar(50) | |
| ImageURL | nvarchar(1000) | |
| Duration | int | In seconds |
| Price | decimal(18,2) | |
| Currency | nvarchar(10) | |
| IsFree | bit | |
| InstructorName | nvarchar(255) | |
| CertificateEnabled | bit | |
| TotalEnrollments | int | |
| TotalCompletions | int | |
| AverageRating | decimal(3,2) | |
| Tags | nvarchar(max) | JSON array |
| LWCreatedAt | datetimeoffset | |
| LWUpdatedAt | datetimeoffset | |
| LastSyncedAt | datetimeoffset | |

#### `LW Enrollments`
| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier | MJ primary key |
| CompanyID | uniqueidentifier | FK → Companies |
| LWUserID | uniqueidentifier | FK → LW Users |
| LWCourseID | uniqueidentifier | FK → LW Courses |
| LearnWorldsEnrollmentID | nvarchar(100) | LW's internal enrollment ID |
| Status | nvarchar(50) | active, completed, expired, suspended |
| EnrolledAt | datetimeoffset | |
| StartsAt | datetimeoffset | |
| ExpiresAt | datetimeoffset | |
| CompletedAt | datetimeoffset | |
| ProgressPercentage | decimal(5,2) | 0.00 to 100.00 |
| CompletedLessons | int | |
| TotalLessons | int | |
| CompletedUnits | int | |
| TotalUnits | int | |
| TotalTimeSpent | int | Seconds |
| LastAccessedAt | datetimeoffset | |
| Grade | decimal(5,2) | |
| CertificateEligible | bit | |
| CertificateIssuedAt | datetimeoffset | |
| LastSyncedAt | datetimeoffset | |

#### `LW Course Progress`
| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier | MJ primary key |
| LWEnrollmentID | uniqueidentifier | FK → LW Enrollments |
| ProgressPercentage | decimal(5,2) | |
| CompletedLessons | int | |
| TotalLessons | int | |
| CompletedUnits | int | |
| TotalUnits | int | |
| TotalTimeSpent | int | Seconds |
| AverageSessionTime | int | Seconds |
| QuizScoreAverage | decimal(5,2) | |
| AssignmentsCompleted | int | |
| AssignmentsTotal | int | |
| CurrentGrade | decimal(5,2) | |
| EstimatedTimeToComplete | int | Seconds |
| LastAccessedAt | datetimeoffset | |
| SyncedAt | datetimeoffset | Snapshot timestamp |

#### `LW Certificates`
| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier | MJ primary key |
| LWUserID | uniqueidentifier | FK → LW Users |
| LWCourseID | uniqueidentifier | FK → LW Courses |
| LearnWorldsCertificateID | nvarchar(100) | |
| IssuedAt | datetimeoffset | |
| ExpiresAt | datetimeoffset | |
| CertificateURL | nvarchar(1000) | |
| VerificationCode | nvarchar(255) | |
| VerificationURL | nvarchar(1000) | |
| LastSyncedAt | datetimeoffset | |

#### `LW Learner Onboardings`
(As described in section 1.8 above)

### 2.4 Sync Service Class

```typescript
export class LearnWorldsSyncService {
    /**
     * Full sync: pulls all data types from LW and upserts to local DB
     */
    public async RunFullSync(params: SyncParams): Promise<SyncResult> {
        const result = new SyncResult();

        // Phase 1: Sync courses (no dependencies)
        result.Courses = await this.syncCourses();

        // Phase 2: Sync users (no dependencies)
        result.Users = await this.syncUsers();

        // Phase 3: Sync enrollments (depends on users + courses existing locally)
        result.Enrollments = await this.syncEnrollments();

        // Phase 4: Sync progress (depends on enrollments)
        result.Progress = await this.syncProgress();

        // Phase 5: Sync certificates (depends on users + courses)
        result.Certificates = await this.syncCertificates();

        return result;
    }

    /**
     * Delta sync: only pull records changed since last sync
     */
    public async RunDeltaSync(params: SyncParams): Promise<SyncResult> {
        // Use lastSyncTimestamp to filter API calls where supported
        // Fall back to full pull + upsert where LW API doesn't support delta
    }
}
```

### 2.5 Sync Strategies

**Users and Courses**: LW's `GET /v2/users` and `GET /v2/courses` endpoints support sorting by date. We can:
- Track `LastSyncedAt` per entity
- Pull records sorted by `updated_at DESC`
- Stop pagination when we hit records older than our last sync

**Enrollments and Progress**: These are per-user, so the sync must:
1. Get list of active LW users from local DB
2. For each user, pull enrollments from LW
3. For each active enrollment, pull progress
4. Batch upsert locally

This is where the sync can get expensive (N+1 API calls). Mitigations:
- Run in parallel with controlled concurrency (e.g., 5 concurrent user syncs)
- Only sync users with `LastActivityAt > LastSyncedAt` (skip inactive users)
- Run full sync less frequently (daily), delta sync more frequently (every 6 hours)

### 2.6 Scheduled Job Configuration

```json
{
    "entity": "MJ: Scheduled Jobs",
    "fields": {
        "Name": "Sync LearnWorlds Data - Every 6 Hours",
        "Description": "Pulls user, enrollment, progress, and certificate data from LearnWorlds",
        "JobTypeID": "@lookup:MJ: Scheduled Job Types.DriverClass=ActionScheduledJobDriver",
        "CronExpression": "0 0 */6 * * *",
        "Timezone": "UTC",
        "Status": "Active",
        "ConcurrencyMode": "Skip",
        "Configuration": {
            "ActionID": "@lookup:Actions.Name=LearnWorlds - Sync Data",
            "Params": [
                {
                    "ActionParamID": "@lookup:Action Params.Name=CompanyID",
                    "ValueType": "Static",
                    "Value": "your-company-id"
                },
                {
                    "ActionParamID": "@lookup:Action Params.Name=SyncMode",
                    "ValueType": "Static",
                    "Value": "delta"
                }
            ]
        }
    }
}
```

---

## Part 3: Implementation Plan

### Phase 1: New LW Actions (Foundation)

Build the missing LearnWorlds API actions that both the onboarding and sync flows need:

| # | Item | File | LW Endpoint |
|---|------|------|-------------|
| 1 | SSO Login action | `sso-login.action.ts` | `POST /v2/sso` |
| 2 | Update User action | `update-user.action.ts` | `PUT /v2/users/{id}` |
| 3 | Attach Tags action | `attach-tags.action.ts` | `POST /v2/users/{id}/tags` |
| 4 | Detach Tags action | `detach-tags.action.ts` | `DELETE /v2/users/{id}/tags` |
| 5 | Find User by Email (utility, not action) | In base or service | `GET /v2/users?email=` |
| 6 | Action metadata for new actions | `.bizapps-actions.json` | N/A |
| 7 | Unit tests for all new actions | `__tests__/` | N/A |

### Phase 2: Database Schema (Local Entities)

Create migration for local LW data storage:

| # | Item | Details |
|---|------|---------|
| 1 | Migration SQL file | `migrations/v2/VYYYYMMDDHHMM__vX.X.x_LW_Sidecar_Entities.sql` |
| 2 | Create `LW Users` table | See schema in 2.3 |
| 3 | Create `LW Courses` table | See schema in 2.3 |
| 4 | Create `LW Enrollments` table | See schema in 2.3 |
| 5 | Create `LW Course Progress` table | See schema in 2.3 |
| 6 | Create `LW Certificates` table | See schema in 2.3 |
| 7 | Create `LW Learner Onboardings` table | See schema in 1.8 |
| 8 | Run CodeGen to generate entity classes | Auto-generates TypeScript classes, views, SPs |

### Phase 3: Onboarding Service + Action

| # | Item | Details |
|---|------|---------|
| 1 | `LearnWorldsOnboardingService` | Core orchestration logic |
| 2 | `OnboardLearnerAction` | Thin wrapper for discoverability |
| 3 | REST endpoint `/api/onboard-learner` | Frontend calls this after Auth0 login |
| 4 | Stripe payment validation utility | Verify payment_intent status |
| 5 | Onboarding record creation | Write to `LW Learner Onboardings` entity |
| 6 | Error handling and retry logic | Handle partial failures gracefully |
| 7 | Unit tests | Mock LW API, Stripe, and DB calls |

### Phase 4: Sync Service + Scheduled Job

| # | Item | Details |
|---|------|---------|
| 1 | `LearnWorldsSyncService` | Core sync logic with full/delta modes |
| 2 | `SyncLearnWorldsDataAction` | Action wrapper for scheduler |
| 3 | Individual sync methods | `syncUsers()`, `syncCourses()`, `syncEnrollments()`, `syncProgress()`, `syncCertificates()` |
| 4 | Scheduled job metadata | JSON file for mj-sync |
| 5 | Upsert logic | Match by LW ID, create or update local records |
| 6 | Concurrency control | Limit parallel API calls to avoid rate limiting |
| 7 | Sync logging and reporting | Track counts, errors, duration per sync type |
| 8 | Unit tests | Mock LW API responses, verify upsert logic |

### Phase 5: Frontend Component

| # | Item | Details |
|---|------|---------|
| 1 | Course checkout page/component | Stripe Checkout → Auth0 → Redirect flow |
| 2 | Auth0 widget integration | Prefill email from Stripe, handle callback |
| 3 | Onboarding API call | POST to `/api/onboard-learner` |
| 4 | Loading/error states | Handle each step's success/failure |
| 5 | Redirect to LW | Use SSO login URL from backend |

### Phase 6: Webhook Support (Optional Enhancement)

| # | Item | Details |
|---|------|---------|
| 1 | Webhook receiver endpoint | `POST /api/webhooks/learnworlds` |
| 2 | Webhook signature validation | Verify LW webhook authenticity |
| 3 | Event handlers | Process enrollment.completed, user.updated, etc. |
| 4 | Real-time sync trigger | Update local entities immediately on webhook events |

---

## Part 4: Package Structure

All new code lives in the existing `@memberjunction/actions-bizapps-lms` package:

```
packages/Actions/BizApps/LMS/
├── src/
│   ├── base/
│   │   └── base-lms.action.ts                    (existing)
│   ├── providers/
│   │   └── learnworlds/
│   │       ├── learnworlds-base.action.ts         (existing)
│   │       ├── actions/
│   │       │   ├── create-user.action.ts          (existing)
│   │       │   ├── enroll-user.action.ts          (existing)
│   │       │   ├── sso-login.action.ts            ← NEW
│   │       │   ├── update-user.action.ts          ← NEW
│   │       │   ├── attach-tags.action.ts          ← NEW
│   │       │   ├── detach-tags.action.ts          ← NEW
│   │       │   ├── onboard-learner.action.ts      ← NEW (thin wrapper)
│   │       │   ├── sync-data.action.ts            ← NEW (thin wrapper)
│   │       │   ├── ... (existing actions)
│   │       │   └── index.ts                       (update exports)
│   │       └── services/
│   │           ├── onboarding.service.ts           ← NEW
│   │           ├── sync.service.ts                 ← NEW
│   │           └── index.ts                        ← NEW
│   ├── interfaces/
│   │   ├── onboarding.types.ts                     ← NEW
│   │   └── sync.types.ts                           ← NEW
│   └── index.ts                                    (update exports)
├── __tests__/
│   ├── onboarding.service.test.ts                  ← NEW
│   ├── sync.service.test.ts                        ← NEW
│   ├── sso-login.action.test.ts                    ← NEW
│   └── ...
└── package.json                                    (add stripe dependency)
```

### New Dependencies

```json
{
    "stripe": "^14.x"     // For Stripe payment verification
}
```

Note: Auth0 Management API calls (if needed) would use the existing `@auth0/auth0-angular` SDK on the frontend side. Server-side Auth0 integration is already handled by MJ's auth provider system.

---

## Part 5: Open Questions

1. **Stripe integration scope**: Do we need a full Stripe integration package, or just payment verification for onboarding? If we already process Stripe webhooks elsewhere, we should reuse that.

2. **LW API rate limits**: Need to verify LearnWorlds' rate limits for the sync service. The progress sync could generate hundreds of API calls per run.

3. **SSO endpoint availability**: The `POST /v2/sso` endpoint requires a specific LearnWorlds plan level. Need to confirm our LW account has SSO API access.

4. **Course-to-product mapping**: When someone buys via Stripe, how do we map the Stripe product/price to LW course IDs? Options:
   - Store mapping in a new MJ entity (`LW Course Stripe Mappings`)
   - Use Stripe product metadata (`learnworlds_course_id` field)
   - Use a configuration table

5. **Auth0 widget placement**: Should the Auth0 Universal Login widget appear inline on the checkout page, or should we redirect to Auth0's hosted login page? Inline is smoother but requires more frontend work.

6. **Webhook vs. polling priority**: Should we invest in LW webhook receiver for real-time sync in Phase 1, or is 6-hour polling sufficient initially?
