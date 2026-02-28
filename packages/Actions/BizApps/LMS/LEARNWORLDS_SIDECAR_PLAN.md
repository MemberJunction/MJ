# LearnWorlds Sidecar Integration Plan

## Executive Summary

This document details the plan for building a "sidecar" integration with LearnWorlds (LW) where MemberJunction (MJ) owns the checkout and authentication flow, and LearnWorlds serves as the course delivery platform. The two primary objectives are:

1. **Onboarding Flow**: Stripe checkout → Auth0 account creation → LW user provisioning + enrollment → immediate redirect into LW (no password-reset email)
2. **Data Retrieval Actions**: Actions that pull learner progress, enrollment status, certificates, and other data from LW — consumers handle their own DB storage, scheduling, and mapping

---

## Part 1: Onboarding Flow

### 1.1 End-to-End User Journey

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER JOURNEY                                     │
│                                                                         │
│  1. User lands on signup/purchase page                                  │
│  2. Stripe Checkout form collects payment + email                       │
│  3. Stripe payment succeeds                                             │
│  4. Same page transitions to Auth0 login widget (inline, not redirect)  │
│     └─ If user already has Auth0 account → they log in                  │
│     └─ If new user → they create Auth0 account (email prefilled)        │
│  5. Auth0 callback returns to our app with auth token                   │
│  6. Our app calls backend "Onboard Learner" action                      │
│     └─ Backend creates user in LW (if not exists)                       │
│     └─ Backend enrolls user in purchased course(s)/bundle(s)            │
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

### 1.3 Architecture Decision: Action with Strongly-Typed Class Composition

The onboarding orchestration is built as an **Action** that directly instantiates other action classes and calls their **strongly-typed public methods** (not via the Action execution interface). This gives us:

- **Agent/workflow discoverability**: It's a registered Action, so agents can find and invoke it, and it can be scheduled
- **Type safety**: Direct class instantiation with typed method signatures, not serialized params
- **Code reuse**: The individual action classes (CreateUser, EnrollUser, SSO) are both standalone Actions AND reusable building blocks
- **No rule violation**: We're not calling actions through the Action interface — we're using classes directly

**The refactor pattern** applied to all existing and new action classes:

```typescript
// Each action class exposes a strongly-typed public method
// alongside the InternalRunAction entry point

class CreateUserAction extends LearnWorldsBaseAction {
    /** Strongly-typed, directly callable by other code */
    public async CreateUser(params: CreateUserParams, contextUser: UserInfo): Promise<CreateUserResult> {
        // Core logic with typed params and result
    }

    /** Action framework entry point — maps untyped params to typed method */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const typed = this.extractParams(params.Params);
        const result = await this.CreateUser(typed, params.ContextUser);
        return this.mapToActionResult(result);
    }
}

// Onboarding action instantiates classes directly and calls typed methods
class OnboardLearnerAction extends LearnWorldsBaseAction {
    public async OnboardLearner(params: OnboardLearnerParams, contextUser: UserInfo): Promise<OnboardResult> {
        const createAction = new CreateUserAction();
        const lwUser = await createAction.CreateUser({ Email: params.Email, ... }, contextUser);

        const enrollAction = new EnrollUserAction();
        await enrollAction.EnrollUser({ UserId: lwUser.Id, ... }, contextUser);

        const ssoAction = new SSOLoginAction();
        const ssoResult = await ssoAction.GenerateSSOUrl({ Email: params.Email, ... }, contextUser);

        return { LoginURL: ssoResult.Url, ... };
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const typed = this.extractParams(params.Params);
        const result = await this.OnboardLearner(typed, params.ContextUser);
        return this.mapToActionResult(result);
    }
}
```

### 1.4 Detailed Onboarding Flow — Technical Sequence

```
Frontend (Angular Element Widget)    Backend (MJAPI)                    External Services
─────────────────────────────────    ───────────────                    ─────────────────

1. Embedded Angular Element shows
   Stripe Checkout form
   ─── Stripe.js ───────────────────────────────────────────────────── Stripe
   Payment succeeds
   Stripe returns payment_intent.id
   and customer email

2. Widget seamlessly transitions to
   Auth0 login/signup (inline, same widget)
   (email prefilled from Stripe)
   ─── Auth0 SDK ──────────────────────────────────────────────────── Auth0
   User logs in OR creates account
   Auth0 returns ID token + user info

3. Widget calls backend
   POST /api/onboard-learner
   {
     email,
     firstName, lastName,
     courseIds[],     ← caller provides LW course/bundle IDs
     bundleIds[],     ← optional LW bundle IDs
     redirectTo
   }
                                     4. Create/find LW user
                                        ─── LW API ─────────────────── LearnWorlds
                                        POST /v2/users (if new)
                                        GET /v2/users?email= (if exists)

                                     5. Enroll in course(s) and/or bundle(s)
                                        ─── LW API ─────────────────── LearnWorlds
                                        POST /v2/enrollments (product_type: course|bundle)

                                     6. Generate SSO login URL
                                        ─── LW API ─────────────────── LearnWorlds
                                        POST /v2/sso
                                        { email, redirect_to: course_url }
                                        Returns: { url, user_id }

                                     7. Return SSO URL to frontend

8. window.location.href = ssoUrl
   User lands in LW, auto-logged in,
   on the course they purchased
```

### 1.5 Course/Bundle Mapping — Consumer Responsibility

The onboarding action accepts LW course IDs and/or LW bundle IDs directly. **The mapping from a Stripe product/purchase to specific LW course/bundle IDs is the consumer's responsibility**, not this package's.

- The action's `CourseIds` and `BundleIds` input parameters take LW-native identifiers
- Each MJ instance consumer (e.g., BC CDP) maintains their own mapping logic
- This keeps the LMS package generic and reusable across different deployments
- LearnWorlds bundles ARE a real API concept — the enrollment endpoint (`POST /v2/enrollments`) accepts `product_type: "course"` or `product_type: "bundle"` (bundles map to "Learning Programs" in LW's new platform version)

### 1.6 New Components to Build

#### 1.6.1 SSO Login Action (`sso-login.action.ts`)

**LW API Endpoint**: `POST /v2/sso`

```typescript
// Strongly-typed public method
public async GenerateSSOUrl(params: SSOLoginParams, contextUser: UserInfo): Promise<SSOLoginResult> { ... }

// Types
interface SSOLoginParams {
    CompanyID: string;
    Email?: string;       // Use email OR UserID
    UserID?: string;
    RedirectTo?: string;  // URL to land on after login
}

interface SSOLoginResult {
    LoginURL: string;
    LearnWorldsUserID: string;
}
```

#### 1.6.2 Update User Action (`update-user.action.ts`)

**LW API Endpoint**: `PUT /v2/users/{userId}`

```typescript
public async UpdateUser(params: UpdateUserParams, contextUser: UserInfo): Promise<UpdateUserResult> { ... }

interface UpdateUserParams {
    CompanyID: string;
    UserID: string;          // LW user ID
    Email?: string;
    FirstName?: string;
    LastName?: string;
    Username?: string;
    Role?: string;
    IsActive?: boolean;
    Tags?: string[];
    CustomFields?: Record<string, string>;
}
```

#### 1.6.3 Tag Management Actions

**LW API Endpoints**: `POST /v2/users/{userId}/tags`, `DELETE /v2/users/{userId}/tags`

```typescript
public async AttachTags(params: TagParams, contextUser: UserInfo): Promise<TagResult> { ... }
public async DetachTags(params: TagParams, contextUser: UserInfo): Promise<TagResult> { ... }

interface TagParams {
    CompanyID: string;
    UserID: string;
    Tags: string[];
}
```

#### 1.6.4 Onboard Learner Action (`onboard-learner.action.ts`)

The orchestration action — callable by agents, schedulable, AND used directly by the REST endpoint:

```typescript
@RegisterClass(BaseAction, 'OnboardLearnerAction')
export class OnboardLearnerAction extends LearnWorldsBaseAction {
    /**
     * Strongly-typed onboarding method:
     * 1. Find or create LW user
     * 2. Enroll in purchased courses/bundles
     * 3. Generate SSO login URL
     */
    public async OnboardLearner(
        params: OnboardLearnerParams,
        contextUser: UserInfo
    ): Promise<OnboardLearnerResult> {
        // Instantiate action classes directly
        const createUserAction = new CreateUserAction();
        const enrollAction = new EnrollUserAction();
        const ssoAction = new SSOLoginAction();

        // Step 1: Find or create user
        let lwUser: CreateUserResult;
        const existingUser = await this.findUserByEmail(params.Email, contextUser);
        if (existingUser) {
            lwUser = existingUser;
        } else {
            lwUser = await createUserAction.CreateUser({
                CompanyID: params.CompanyID,
                Email: params.Email,
                FirstName: params.FirstName,
                LastName: params.LastName,
                SendWelcomeEmail: false  // We handle auth via Auth0
            }, contextUser);
        }

        // Step 2: Enroll in courses
        const enrollments = [];
        for (const courseId of (params.CourseIds || [])) {
            const enrollment = await enrollAction.EnrollUser({
                CompanyID: params.CompanyID,
                UserId: lwUser.UserId,
                CourseId: courseId,
                ProductType: 'course'
            }, contextUser);
            enrollments.push(enrollment);
        }

        // Step 2b: Enroll in bundles
        for (const bundleId of (params.BundleIds || [])) {
            const enrollment = await enrollAction.EnrollUser({
                CompanyID: params.CompanyID,
                UserId: lwUser.UserId,
                CourseId: bundleId,
                ProductType: 'bundle'
            }, contextUser);
            enrollments.push(enrollment);
        }

        // Step 3: Generate SSO URL
        const ssoResult = await ssoAction.GenerateSSOUrl({
            CompanyID: params.CompanyID,
            Email: params.Email,
            RedirectTo: params.RedirectTo
        }, contextUser);

        return {
            Success: true,
            LoginURL: ssoResult.LoginURL,
            LearnWorldsUserId: lwUser.UserId,
            Enrollments: enrollments
        };
    }

    /** Action framework entry point */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const typed = this.extractOnboardParams(params.Params);
        const result = await this.OnboardLearner(typed, params.ContextUser);
        return this.mapToActionResult(result);
    }
}
```

#### 1.6.5 Typed Interfaces (Exported for Consumers)

```typescript
// Published in package exports for TypeScript consumers

export interface OnboardLearnerParams {
    CompanyID: string;
    Email: string;
    FirstName?: string;
    LastName?: string;
    CourseIds?: string[];     // LW course IDs
    BundleIds?: string[];     // LW bundle IDs (Learning Programs)
    RedirectTo?: string;      // Where to land in LW after login
}

export interface OnboardLearnerResult {
    Success: boolean;
    LoginURL: string;
    LearnWorldsUserId: string;
    Enrollments: EnrollmentResult[];
    ErrorMessage?: string;
}
```

#### 1.6.6 REST Endpoint for Frontend Widget

```typescript
// Custom REST endpoint in MJAPI for the Angular Element widget to call
// POST /api/onboard-learner
app.post('/api/onboard-learner', authenticateJWT, async (req, res) => {
    const { courseIds, bundleIds, redirectTo } = req.body;
    const contextUser = req.user;  // From Auth0 JWT

    const action = new OnboardLearnerAction();
    const result = await action.OnboardLearner({
        CompanyID: resolveCompanyId(contextUser),
        Email: contextUser.Email,
        FirstName: contextUser.FirstName,
        LastName: contextUser.LastName,
        CourseIds: courseIds,
        BundleIds: bundleIds,
        RedirectTo: redirectTo
    }, contextUser);

    res.json({
        success: result.Success,
        loginUrl: result.LoginURL,
        enrollments: result.Enrollments
    });
});
```

### 1.7 Frontend: Angular Element Checkout Widget

The checkout experience is built as a **custom Angular Element** (Web Component) that can be dropped into any website. It seamlessly transitions from Stripe checkout to Auth0 login within the same widget — no page redirects, no jarring context switches.

This is a separate deliverable built by consumers (e.g., BC CDP) but the LMS package provides the backend actions it calls. The widget would:

1. **Step 1 — Stripe**: Embed Stripe Elements form for payment collection
2. **Step 2 — Auth0**: On payment success, transition to inline Auth0 login/signup (email prefilled from Stripe)
3. **Step 3 — Onboard**: After Auth0 login, call `POST /api/onboard-learner` with course/bundle IDs
4. **Step 4 — Redirect**: On success, `window.location.href = loginUrl` to send user to LW

### 1.8 Edge Cases and Error Handling

| Scenario | Handling |
|----------|----------|
| **User already exists in LW** | `findUserByEmail` finds them; skip creation, proceed to enrollment + SSO |
| **User already enrolled** | LW API returns enrollment details; skip re-enrollment, proceed to SSO |
| **LW user creation fails** | Return error with details; payment is still valid (can retry) |
| **SSO URL generation fails** | Fall back to LW's `login_url` from user creation response |
| **Auth0 account exists but LW doesn't** | Normal flow — create LW user, enroll, generate SSO |
| **User closes browser after Stripe, before Auth0** | Payment exists but no LW user; consumer handles reconciliation |
| **LW API rate limiting** | Exponential backoff retry in `makeLearnWorldsRequest`; surface error if exhausted |

---

## Part 2: Data Retrieval Actions

### 2.1 Design Philosophy

The LMS package provides **actions that retrieve data from LearnWorlds and return strongly-typed JSON payloads**. The package does NOT:
- Define database entities for storing LW data
- Handle scheduling of sync jobs
- Map LW data to local database schemas

These are all **consumer responsibilities**. Each MJ instance (e.g., BC CDP) decides:
- Which data to pull and how often
- What local tables/entities to store it in
- How to schedule the sync (via MJ's ScheduledJob infrastructure)
- How to map LW data structures to their own schemas

### 2.2 What the Package Provides

#### Existing Retrieval Actions (Already Built)
- `GetLearnWorldsUsersAction` — list/search users with filters
- `GetLearnWorldsUserDetailsAction` — comprehensive user profile
- `GetLearnWorldsUserProgressAction` — learning progress across courses
- `GetLearnWorldsCoursesAction` — course catalog
- `GetLearnWorldsCourseDetailsAction` — full course info with curriculum
- `GetLearnWorldsUserEnrollmentsAction` — user's enrollments with progress
- `GetCourseAnalyticsAction` — course performance analytics
- `GetQuizResultsAction` — quiz/assessment results
- `GetCertificatesAction` — earned certificates

#### New Retrieval Action
- `GetLearnWorldsBundlesAction` — list bundles/learning programs (`GET /v2/bundles`)

#### Exported TypeScript Interfaces for Consumers

The package exports strongly-typed interfaces that consumers can use when processing action results in TypeScript:

```typescript
// Consumers import these for type-safe processing of action output
export interface LearnWorldsUser {
    Id: string;
    Email: string;
    Username: string;
    FirstName: string;
    LastName: string;
    Status: 'active' | 'inactive' | 'suspended';
    Role: 'student' | 'instructor' | 'admin';
    Tags: string[];
    CustomFields: Record<string, string>;
    CreatedAt: string;
    LastLoginAt: string;
    LastActivityAt: string;
    TotalCertificates: number;
    Points: number;
}

export interface LearnWorldsEnrollment {
    Id: string;
    CourseId: string;
    UserId: string;
    Status: 'active' | 'completed' | 'expired' | 'suspended';
    EnrolledAt: string;
    CompletedAt: string | null;
    ProgressPercentage: number;
    CompletedLessons: number;
    TotalLessons: number;
    TotalTimeSpent: number;
    Grade: number | null;
    CertificateEligible: boolean;
    CertificateIssuedAt: string | null;
}

export interface LearnWorldsCourse {
    Id: string;
    Title: string;
    Description: string;
    Status: 'draft' | 'published' | 'archived';
    Price: number;
    Currency: string;
    IsFree: boolean;
    Duration: number;
    TotalEnrollments: number;
    CertificateEnabled: boolean;
}

export interface LearnWorldsBundle {
    Id: string;
    Title: string;
    Description: string;
    Price: number;
    Currency: string;
    CourseIds: string[];
    Status: string;
}

export interface LearnWorldsCourseProgress {
    UserId: string;
    CourseId: string;
    ProgressPercentage: number;
    CompletedLessons: number;
    TotalLessons: number;
    CompletedUnits: number;
    TotalUnits: number;
    TotalTimeSpent: number;
    QuizScoreAverage: number | null;
    LastAccessedAt: string;
}

export interface LearnWorldsCertificate {
    Id: string;
    UserId: string;
    CourseId: string;
    IssuedAt: string;
    ExpiresAt: string | null;
    CertificateURL: string;
    VerificationCode: string;
    VerificationURL: string;
}

// Sync result types for consumers building sync services
export interface LearnWorldsSyncPayload {
    Users: LearnWorldsUser[];
    Courses: LearnWorldsCourse[];
    Bundles: LearnWorldsBundle[];
    Enrollments: LearnWorldsEnrollment[];
    Progress: LearnWorldsCourseProgress[];
    Certificates: LearnWorldsCertificate[];
    SyncTimestamp: string;
    TotalApiCalls: number;
    Errors: SyncError[];
}

export interface SyncError {
    Entity: string;
    EntityId: string;
    ErrorMessage: string;
    Timestamp: string;
}
```

### 2.3 Consumer-Side Sync Pattern (Example for BC CDP)

The consumer (e.g., BC CDP) would build their own sync infrastructure using the LMS package:

```typescript
// Example consumer-side sync service (NOT in the LMS package)
import {
    GetLearnWorldsUsersAction,
    GetLearnWorldsUserEnrollmentsAction,
    LearnWorldsUser,
    LearnWorldsEnrollment
} from '@memberjunction/actions-bizapps-lms';

class BCLearnerSyncService {
    async syncFromLearnWorlds() {
        // Use the typed public methods directly
        const getUsersAction = new GetLearnWorldsUsersAction();
        const users = await getUsersAction.GetUsers({
            CompanyID: myCompanyId,
            MaxResults: 1000
        }, contextUser);

        // Map to local DB entities (consumer's schema)
        for (const lwUser of users.Users) {
            await this.upsertLocalLearnerRecord(lwUser);
        }
    }
}
```

The consumer would then schedule this via MJ's `ScheduledJob` infrastructure.

### 2.4 Bulk Data Retrieval Action (New)

For consumers who want to pull everything in one call:

```typescript
@RegisterClass(BaseAction, 'GetLearnWorldsBulkDataAction')
export class GetLearnWorldsBulkDataAction extends LearnWorldsBaseAction {
    /**
     * Pulls all data types from LW in a single call.
     * Returns a LearnWorldsSyncPayload with all entities.
     * Consumer decides what to do with the data.
     */
    public async GetBulkData(
        params: BulkDataParams,
        contextUser: UserInfo
    ): Promise<LearnWorldsSyncPayload> {
        // Orchestrate all retrieval actions
        const getUsersAction = new GetLearnWorldsUsersAction();
        const getCoursesAction = new GetLearnWorldsCoursesAction();
        // ... etc

        const users = await getUsersAction.GetUsers({ ... }, contextUser);
        const courses = await getCoursesAction.GetCourses({ ... }, contextUser);
        // ...

        return {
            Users: users,
            Courses: courses,
            // ...
            SyncTimestamp: new Date().toISOString(),
            TotalApiCalls: totalCalls,
            Errors: errors
        };
    }
}
```

---

## Part 3: Stripe Integration in Core MJ (Separate Workstream)

### 3.1 Current State

There is **no Stripe SDK or integration** anywhere in MJ today. The Accounting BizApps package covers Business Central and QuickBooks, but not Stripe.

### 3.2 Two-Part Stripe Integration

Stripe is ubiquitous enough to warrant a core MJ integration with both server-side actions (non-visual) and a client-side Angular widget (visual).

#### Server-Side: `@memberjunction/actions-bizapps-payments` (new BizApps package)

Non-visual integration — actions that agents, workflows, and scheduled jobs can call:

```
packages/Actions/BizApps/Payments/
├── src/
│   ├── base/
│   │   └── base-payment.action.ts           # Shared payment provider patterns
│   ├── providers/
│   │   └── stripe/
│   │       ├── stripe-base.action.ts        # Stripe API auth, common utilities
│   │       └── actions/
│   │           ├── verify-payment.action.ts          # Verify payment_intent status
│   │           ├── create-checkout-session.action.ts  # Create Stripe Checkout session
│   │           ├── get-customer.action.ts             # Get customer details
│   │           ├── get-payment-intent.action.ts       # Get payment intent details
│   │           ├── list-subscriptions.action.ts       # List customer subscriptions
│   │           ├── create-payment-link.action.ts      # Generate payment links
│   │           └── list-invoices.action.ts            # List customer invoices
│   ├── interfaces/
│   │   └── stripe.types.ts                  # Exported typed interfaces
│   └── index.ts
├── package.json                             # Depends on `stripe` npm package
```

Same pattern as LMS — each action exposes a strongly-typed public method alongside `InternalRunAction`. Extensible for future payment providers (PayPal, Square, etc.) via the base class.

#### Client-Side: `@memberjunction/ng-stripe` (new Angular/Generic package)

Visual integration — an Angular wrapper widget for Stripe Elements:

```
packages/Angular/Generic/stripe/
├── src/lib/
│   ├── components/
│   │   ├── stripe-payment-form/             # Wraps Stripe Elements (card, payment)
│   │   ├── stripe-checkout-button/          # One-click checkout button
│   │   └── stripe-payment-status/           # Payment confirmation display
│   ├── services/
│   │   ├── stripe-config.service.ts         # Publishable key management
│   │   └── stripe-elements.service.ts       # Stripe.js SDK lifecycle
│   ├── types/
│   │   └── stripe-widget.types.ts
│   └── module.ts                            # StripeModule for NgModule consumers
├── package.json                             # Depends on `@stripe/stripe-js`
```

The widget provides:
- Drop-in `<mj-stripe-payment-form>` component for embedding in any Angular app or Angular Element
- Event emitters: `(paymentSuccess)`, `(paymentError)`, `(paymentProcessing)`
- Configurable via `@Input()` properties: amount, currency, publishable key, payment method types
- Handles Stripe.js SDK loading and lifecycle
- Can be combined with auth widgets in a checkout flow

### 3.3 Scope for This Project

For the LW sidecar integration, the onboarding action does NOT need Stripe payment verification. The flow is:
1. Frontend handles Stripe checkout (via `@memberjunction/ng-stripe` widget or consumer's own Stripe integration)
2. Frontend handles Auth0 login
3. Frontend calls onboard-learner with LW course/bundle IDs
4. Backend only talks to LW — no Stripe server-side calls needed

If Stripe server-side verification is desired as an extra safety layer (verifying the payment_intent is actually paid before provisioning), that would be part of the Payments BizApps package and called from the consumer's REST endpoint, not from the LMS package itself.

---

## Part 3b: Generic Auth Widget in Core MJ (Separate Workstream)

### Current State

The existing auth integration lives at `packages/Angular/Explorer/auth-services/` and is **tightly coupled to the Explorer app**. It provides Auth0 authentication via `MJAuth0Provider` but is not reusable outside Explorer.

### Recommendation: Generic Auth Package Under `Angular/Generic`

Build a provider-agnostic auth widget under `packages/Angular/Generic/` that:
- Provides embeddable login/signup UI components
- Supports multiple auth providers (Auth0 initially, extensible to others)
- Can be used in Angular Elements (Web Components) for embedding in external sites
- Can be consumed by Explorer (replacing or wrapping the current Explorer-specific auth)

#### Proposed Structure

```
packages/Angular/Generic/auth/
├── src/lib/
│   ├── components/
│   │   ├── auth-login-widget/               # Embeddable login/signup form
│   │   ├── auth-status-indicator/           # Shows logged-in state
│   │   └── auth-profile-menu/              # User profile dropdown
│   ├── providers/
│   │   ├── auth-provider.base.ts            # Abstract base for auth providers
│   │   ├── auth0/
│   │   │   └── auth0-provider.service.ts    # Auth0 implementation
│   │   └── index.ts
│   ├── services/
│   │   ├── auth-config.service.ts           # Configuration management
│   │   └── auth-state.service.ts            # Observable auth state
│   ├── types/
│   │   └── auth.types.ts
│   └── module.ts                            # GenericAuthModule
├── package.json
```

#### Key Design Goals

- **Provider-agnostic**: The widget components work with any auth provider that implements the base interface
- **Embeddable**: Works in Angular Elements (Web Components) for embedding in marketing sites, checkout pages, etc.
- **Email prefill**: The login widget accepts an `email` input to prefill from a prior step (e.g., Stripe checkout)
- **Event-driven**: Emits `(loginSuccess)`, `(loginError)`, `(signupSuccess)` events
- **Explorer-compatible**: Explorer's auth can migrate to use this generic package, reducing duplication

#### Relationship to the LW Sidecar Checkout Widget

The consumer's Angular Element checkout widget (e.g., BC CDP) would compose:
1. `<mj-stripe-payment-form>` from `@memberjunction/ng-stripe`
2. `<mj-auth-login-widget>` from `@memberjunction/ng-auth` (with email prefilled from Stripe)
3. Custom checkout logic that calls the onboarding REST endpoint
4. Redirect to LW on success

This gives maximum reusability — both widgets are useful independently and together.

---

## Part 4: Implementation Plan

### Phase 1: Refactor Existing Actions + Build New Actions

Refactor existing action classes to expose strongly-typed public methods, and build the new actions:

| # | Item | File | Details |
|---|------|------|---------|
| 1 | Refactor `CreateUserAction` | `create-user.action.ts` | Extract `CreateUser(params, contextUser)` public method |
| 2 | Refactor `EnrollUserAction` | `enroll-user.action.ts` | Extract `EnrollUser(params, contextUser)` public method; add bundle support via `product_type` |
| 3 | Refactor all other existing actions | Various | Same pattern: typed public method + thin InternalRunAction |
| 4 | **NEW**: SSO Login action | `sso-login.action.ts` | `POST /v2/sso` — `GenerateSSOUrl()` |
| 5 | **NEW**: Update User action | `update-user.action.ts` | `PUT /v2/users/{id}` — `UpdateUser()` |
| 6 | **NEW**: Attach Tags action | `attach-tags.action.ts` | `POST /v2/users/{id}/tags` — `AttachTags()` |
| 7 | **NEW**: Detach Tags action | `detach-tags.action.ts` | `DELETE /v2/users/{id}/tags` — `DetachTags()` |
| 8 | **NEW**: Get Bundles action | `get-bundles.action.ts` | `GET /v2/bundles` — `GetBundles()` |
| 9 | Export typed interfaces | `interfaces/` | All strongly-typed param/result interfaces |
| 10 | Action metadata | `.bizapps-actions.json` | Metadata entries for new actions |
| 11 | Unit tests | `__tests__/` | Tests for all new and refactored actions |

### Phase 2: Onboarding Action

| # | Item | Details |
|---|------|---------|
| 1 | `OnboardLearnerAction` | Orchestration action with typed `OnboardLearner()` method |
| 2 | `findUserByEmail` utility | Shared method in base class for user lookup |
| 3 | Action metadata | Entry in `.bizapps-actions.json` |
| 4 | Unit tests | Mock LW API calls, test full flow + edge cases |

### Phase 3: Bulk Data Retrieval Action

| # | Item | Details |
|---|------|---------|
| 1 | `GetLearnWorldsBulkDataAction` | Orchestrates all retrieval actions, returns `LearnWorldsSyncPayload` |
| 2 | Concurrency control | Limit parallel API calls to avoid LW rate limiting |
| 3 | Error collection | Partial failures logged in `Errors` array, doesn't abort entire sync |
| 4 | Action metadata | Entry in `.bizapps-actions.json` |
| 5 | Unit tests | Mock all sub-action calls, verify payload assembly |

### Phase 4: Frontend (Consumer-Built, Not in LMS Package)

The Angular Element checkout widget is built by the consumer (BC CDP). The LMS package provides:
- Backend actions the widget calls
- TypeScript interfaces the widget can use
- REST endpoint pattern (documented, consumer implements in their MJAPI instance)

---

## Part 5: Package Structure

```
packages/Actions/BizApps/LMS/
├── src/
│   ├── base/
│   │   └── base-lms.action.ts                    (existing, unchanged)
│   ├── providers/
│   │   └── learnworlds/
│   │       ├── learnworlds-base.action.ts         (existing, unchanged)
│   │       ├── actions/
│   │       │   ├── create-user.action.ts          (REFACTOR: add typed public method)
│   │       │   ├── enroll-user.action.ts          (REFACTOR: add typed public method + bundle support)
│   │       │   ├── get-users.action.ts            (REFACTOR: add typed public method)
│   │       │   ├── get-user-details.action.ts     (REFACTOR: add typed public method)
│   │       │   ├── get-user-progress.action.ts    (REFACTOR: add typed public method)
│   │       │   ├── get-user-enrollments.action.ts (REFACTOR: add typed public method)
│   │       │   ├── get-courses.action.ts          (REFACTOR: add typed public method)
│   │       │   ├── get-course-details.action.ts   (REFACTOR: add typed public method)
│   │       │   ├── get-course-analytics.action.ts (REFACTOR: add typed public method)
│   │       │   ├── get-quiz-results.action.ts     (REFACTOR: add typed public method)
│   │       │   ├── get-certificates.action.ts     (REFACTOR: add typed public method)
│   │       │   ├── update-user-progress.action.ts (REFACTOR: add typed public method)
│   │       │   ├── sso-login.action.ts            ← NEW
│   │       │   ├── update-user.action.ts          ← NEW
│   │       │   ├── attach-tags.action.ts          ← NEW
│   │       │   ├── detach-tags.action.ts          ← NEW
│   │       │   ├── get-bundles.action.ts          ← NEW
│   │       │   ├── onboard-learner.action.ts      ← NEW (orchestration)
│   │       │   ├── get-bulk-data.action.ts        ← NEW (bulk retrieval)
│   │       │   └── index.ts                       (update exports)
│   │       └── interfaces/
│   │           ├── user.types.ts                   ← NEW (or refactored from inline)
│   │           ├── course.types.ts                 ← NEW
│   │           ├── enrollment.types.ts             ← NEW
│   │           ├── onboarding.types.ts             ← NEW
│   │           ├── sync.types.ts                   ← NEW
│   │           └── index.ts                        ← NEW
│   └── index.ts                                    (update exports)
├── src/__tests__/
│   ├── sso-login.action.test.ts                    ← NEW
│   ├── update-user.action.test.ts                  ← NEW
│   ├── onboard-learner.action.test.ts              ← NEW
│   ├── get-bulk-data.action.test.ts                ← NEW
│   └── ...
└── package.json                                    (no new deps needed — Stripe is consumer-side)
```

### No New Dependencies

The LMS package does NOT need Stripe as a dependency. Stripe handling happens:
- **Client-side**: In the Angular Element widget (consumer-built) via `@stripe/stripe-js`
- **Server-side** (if needed): In a future `@memberjunction/actions-bizapps-payments` package

---

## Part 6: Resolved Questions

| # | Question | Decision |
|---|----------|----------|
| 1 | **Course-to-product mapping** | Consumer's responsibility. The onboarding action accepts LW course IDs and bundle IDs directly. Each MJ instance maintains its own mapping (e.g., BC CDP has its own mapping table). |
| 2 | **Auth0 widget placement** | Inline within a custom Angular Element widget. The widget transitions seamlessly from Stripe to Auth0 within the same embedded component — no redirects. |
| 3 | **Data sync approach** | Actions return JSON payloads with typed interfaces. Consumers handle their own DB storage, scheduling, and mapping. The package exports `LearnWorldsSyncPayload` and related interfaces for TypeScript consumers. |
| 4 | **Stripe integration** | Not in the LMS package. A future `@memberjunction/actions-bizapps-payments` package is recommended for core MJ. For now, Stripe is handled client-side in the Angular Element widget. |
| 5 | **SSO plan level** | Confirmed — high-end LW plan with SSO API access. |
| 6 | **Multi-course purchases** | Supported. `OnboardLearner` accepts arrays of `CourseIds` and `BundleIds`. Bundles are a real LW API concept (`product_type: "bundle"` in the enrollment endpoint). |

## Part 7: Open Items

1. **LW API rate limits** — Need to verify LW's rate limits. The bulk data retrieval could generate many API calls. May need to add configurable concurrency limits.
2. **LW bundle enrollment API** — Need to verify the exact endpoint and parameters for bundle enrollment. The enrollment endpoint may use `POST /v2/enrollments` with `product_type: "bundle"` or a separate path.
3. **Webhook support (future)** — Not in initial scope. If consumers need real-time sync, LW webhooks can be added later as a separate enhancement.
