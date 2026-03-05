/**
 * LearnWorlds Integration Tests — hits the REAL LearnWorlds API.
 *
 * Covers ALL 17 LearnWorlds actions chained together:
 *   Read-only (no setup needed): GetCourses, GetCourseDetails, GetBundles, GetUsers
 *   Create/mutate:               CreateUser, UpdateUser, AttachTags, DetachTags
 *   Enrollment:                  EnrollUser, GetUserEnrollments, GetUserProgress
 *   Auth:                        SSOLogin
 *   Details:                     GetUserDetails
 *   Orchestration:               OnboardLearner
 *   Lookup:                      FindUserByEmail
 *
 * PREREQUISITES:
 *   1. Copy .env.integration.example -> .env.integration and fill in real values
 *   2. Run:  npm run test:integration
 *
 * These tests are SKIPPED by default (the `describe.skipIf` guard).
 * They only run when LW_INTEGRATION=true is set in the environment.
 */
import { describe, it, expect, vi } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------- load .env.integration if present ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.integration') });

const RUN_INTEGRATION = process.env.LW_INTEGRATION === 'true';

// ---------- mock only the MJ framework plumbing (not fetch) ----------
vi.mock('@memberjunction/actions', () => ({
  BaseAction: class BaseAction {
    protected async InternalRunAction(): Promise<unknown> {
      return {};
    }
  },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
  UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
}));

vi.mock('@memberjunction/core', () => ({
  UserInfo: class UserInfo {},
  Metadata: vi.fn(),
  RunView: vi.fn().mockImplementation(() => ({
    RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
  })),
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJCompanyIntegrationEntity: class MJCompanyIntegrationEntity {
    CompanyID = '';
    APIKey: string | null = null;
    AccessToken: string | null = null;
    ExternalSystemID: string | null = null;
    CustomAttribute1: string | null = null;
  },
}));

vi.mock('@memberjunction/actions-base', () => ({
  ActionParam: class ActionParam {
    Name = '';
    Value: unknown = null;
    Type = 'Input';
  },
}));

// ---------- imports (after mocks) ----------
import { CreateUserAction } from '../providers/learnworlds/actions/create-user.action';
import { EnrollUserAction } from '../providers/learnworlds/actions/enroll-user.action';
import { SSOLoginAction } from '../providers/learnworlds/actions/sso-login.action';
import { GetLearnWorldsUsersAction } from '../providers/learnworlds/actions/get-users.action';
import { GetLearnWorldsUserDetailsAction } from '../providers/learnworlds/actions/get-user-details.action';
import { GetUserEnrollmentsAction } from '../providers/learnworlds/actions/get-user-enrollments.action';
import { GetLearnWorldsUserProgressAction } from '../providers/learnworlds/actions/get-user-progress.action';
import { GetLearnWorldsCoursesAction } from '../providers/learnworlds/actions/get-courses.action';
import { GetLearnWorldsCourseDetailsAction } from '../providers/learnworlds/actions/get-course-details.action';
import { GetBundlesAction } from '../providers/learnworlds/actions/get-bundles.action';
import { UpdateUserAction } from '../providers/learnworlds/actions/update-user.action';
import { AttachTagsAction } from '../providers/learnworlds/actions/attach-tags.action';
import { DetachTagsAction } from '../providers/learnworlds/actions/detach-tags.action';
import { OnboardLearnerAction } from '../providers/learnworlds/actions/onboard-learner.action';
import { LearnWorldsBaseAction } from '../providers/learnworlds/learnworlds-base.action';
import { UserInfo } from '@memberjunction/core';

// ---------- env-driven config ----------
const SCHOOL_DOMAIN = process.env.LW_SCHOOL_DOMAIN || '';
const API_KEY = process.env.LW_API_KEY || '';
const CLIENT_ID = process.env.LW_CLIENT_ID || '';
const COMPANY_ID = process.env.LW_COMPANY_ID || '00000000-0000-0000-0000-000000000001';
const TEST_COURSE_ID = process.env.LW_TEST_COURSE_ID || '';
const TEST_EMAIL = process.env.LW_TEST_EMAIL || `mj-test-${Date.now()}@example.com`;
const ONBOARD_EMAIL = `mj-onboard-${Date.now()}@example.com`;

/**
 * Helper: patch `getCompanyIntegration` and `getAPICredentials` so we
 * bypass the database and use env-var credentials directly.
 */
function patchCredentials<T extends LearnWorldsBaseAction>(action: T): T {
  const a = action as Record<string, unknown>;

  a['getCompanyIntegration'] = async () => ({
    CompanyID: COMPANY_ID,
    APIKey: API_KEY,
    ExternalSystemID: SCHOOL_DOMAIN,
    AccessToken: null,
    CustomAttribute1: null,
  });

  a['getAPICredentials'] = async () => ({
    apiKey: API_KEY,
    apiSecret: undefined,
    accessToken: undefined,
  });

  // Seed the CLIENT_ID env var so buildRequestConfig resolves it
  const provider = 'LEARNWORLDS';
  process.env[`BIZAPPS_${provider}_${COMPANY_ID}_CLIENT_ID`] = CLIENT_ID || SCHOOL_DOMAIN;

  return action;
}

function mockContextUser(): UserInfo {
  return { ID: 'integration-test-user' } as unknown as UserInfo;
}

// ──────────────────────────────────────────────────────────────────────
// Integration suite — only runs when LW_INTEGRATION=true
// ──────────────────────────────────────────────────────────────────────
describe.skipIf(!RUN_INTEGRATION)('LearnWorlds Integration Tests', () => {
  const contextUser = mockContextUser();
  let createdUserId: string | undefined;
  let onboardedUserId: string | undefined;

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: Read-only actions (no setup needed)
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 1: Read-only actions', () => {
    // ─── GetCourses ──────────────────────────────────────────────────
    it('GetCourses — should list courses', async () => {
      const action = patchCredentials(new GetLearnWorldsCoursesAction());
      const result = await action.GetCourses({ CompanyID: COMPANY_ID, MaxResults: 5 }, contextUser);

      expect(result.Courses).toBeDefined();
      expect(Array.isArray(result.Courses)).toBe(true);
      console.log(`  GetCourses: OK (${result.TotalCount} courses returned)`);
    });

    // ─── GetCourseDetails ────────────────────────────────────────────
    it('GetCourseDetails — should get course details', async () => {
      if (!TEST_COURSE_ID) {
        console.warn('  Skipping GetCourseDetails — LW_TEST_COURSE_ID not set');
        return;
      }

      const action = patchCredentials(new GetLearnWorldsCourseDetailsAction());
      const result = await action.GetCourseDetails(
        { CompanyID: COMPANY_ID, CourseID: TEST_COURSE_ID, IncludeModules: false, IncludeInstructors: false, IncludeStats: false },
        contextUser,
      );

      expect(result.CourseDetails).toBeDefined();
      expect(result.CourseDetails.id).toBeTruthy();
      console.log(`  GetCourseDetails: OK (title: "${result.CourseDetails.title}")`);
    });

    // ─── GetBundles ──────────────────────────────────────────────────
    it('GetBundles — should list bundles', async () => {
      const action = patchCredentials(new GetBundlesAction());
      const result = await action.GetBundles({ CompanyID: COMPANY_ID, MaxResults: 5 }, contextUser);

      expect(result.Bundles).toBeDefined();
      expect(Array.isArray(result.Bundles)).toBe(true);
      console.log(`  GetBundles: OK (${result.TotalCount} bundles returned)`);
    });

    // ─── GetUsers ────────────────────────────────────────────────────
    it('GetUsers — should list users', async () => {
      const action = patchCredentials(new GetLearnWorldsUsersAction());
      const result = await action.GetUsers({ CompanyID: COMPANY_ID, MaxResults: 5 }, contextUser);

      expect(result.Users).toBeDefined();
      expect(Array.isArray(result.Users)).toBe(true);
      expect(result.TotalCount).toBeGreaterThan(0);
      console.log(`  GetUsers: OK (${result.TotalCount} users returned)`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: User lifecycle (create -> update -> tags -> enroll)
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 2: User lifecycle', () => {
    // ─── FindUserByEmail (non-existent) ──────────────────────────────
    it('FindUserByEmail — should return null for non-existent user', async () => {
      const action = patchCredentials(new CreateUserAction());
      action.SetCompanyContext(COMPANY_ID);

      const result = await action.FindUserByEmail('nonexistent-integration-test@example.com', contextUser);
      expect(result).toBeNull();
      console.log('  FindUserByEmail: OK (no match, API responded)');
    });

    // ─── CreateUser ──────────────────────────────────────────────────
    it('CreateUser — should create a test user', async () => {
      const action = patchCredentials(new CreateUserAction());

      const result = await action.CreateUser(
        {
          CompanyID: COMPANY_ID,
          Email: TEST_EMAIL,
          FirstName: 'MJ',
          LastName: 'IntegrationTest',
          Role: 'student',
          IsActive: true,
          SendWelcomeEmail: false,
        },
        contextUser,
      );

      expect(result.UserDetails.id).toBeTruthy();
      expect(result.UserDetails.email).toBe(TEST_EMAIL);
      createdUserId = result.UserDetails.id;

      console.log(`  CreateUser: OK (userId=${createdUserId}, username=${result.UserDetails.username})`);
    });

    // ─── UpdateUser ──────────────────────────────────────────────────
    it('UpdateUser — should update the created user', async () => {
      if (!createdUserId) {
        console.warn('  Skipping UpdateUser — no userId');
        return;
      }

      const action = patchCredentials(new UpdateUserAction());

      const result = await action.UpdateUser(
        {
          CompanyID: COMPANY_ID,
          UserID: createdUserId,
          FirstName: 'MJ-Updated',
          LastName: 'IntegrationTest-Updated',
        },
        contextUser,
      );

      expect(result.UserDetails).toBeDefined();
      expect(result.Summary.fieldsUpdated.length).toBeGreaterThan(0);
      console.log(`  UpdateUser: OK (fields updated: ${result.Summary.fieldsUpdated.join(', ')})`);
    });

    // ─── AttachTags ──────────────────────────────────────────────────
    it('AttachTags — should attach tags to the user', async () => {
      if (!createdUserId) {
        console.warn('  Skipping AttachTags — no userId');
        return;
      }

      const action = patchCredentials(new AttachTagsAction());

      const result = await action.AttachTags(
        {
          CompanyID: COMPANY_ID,
          UserID: createdUserId,
          Tags: ['mj-integration-test', 'automated'],
        },
        contextUser,
      );

      expect(result.Success).toBe(true);
      console.log(`  AttachTags: OK (tags: ${result.Tags.join(', ')})`);
    });

    // ─── DetachTags ──────────────────────────────────────────────────
    it('DetachTags — should detach a tag from the user', async () => {
      if (!createdUserId) {
        console.warn('  Skipping DetachTags — no userId');
        return;
      }

      const action = patchCredentials(new DetachTagsAction());

      const result = await action.DetachTags(
        {
          CompanyID: COMPANY_ID,
          UserID: createdUserId,
          Tags: ['automated'],
        },
        contextUser,
      );

      expect(result.Success).toBe(true);
      console.log(`  DetachTags: OK (remaining tags: ${result.Tags.join(', ')})`);
    });

    // ─── EnrollUser ──────────────────────────────────────────────────
    it('EnrollUser — should enroll the created user in a course', async () => {
      if (!createdUserId) {
        console.warn('  Skipping EnrollUser — no userId');
        return;
      }
      if (!TEST_COURSE_ID) {
        console.warn('  Skipping EnrollUser — LW_TEST_COURSE_ID not set');
        return;
      }

      const action = patchCredentials(new EnrollUserAction());

      const result = await action.EnrollUser(
        {
          CompanyID: COMPANY_ID,
          UserID: createdUserId,
          CourseID: TEST_COURSE_ID,
          ProductType: 'course',
          Price: 0,
          Justification: 'MJ integration test',
          NotifyUser: false,
        },
        contextUser,
      );

      expect(result.EnrollmentDetails).toBeTruthy();
      console.log(`  EnrollUser: OK (enrollmentId=${result.EnrollmentDetails.id}, status=${result.EnrollmentDetails.status})`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: User data retrieval (needs created+enrolled user)
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 3: User data retrieval', () => {
    // ─── GetUserDetails ──────────────────────────────────────────────
    it('GetUserDetails — should get full user details', async () => {
      if (!createdUserId) {
        console.warn('  Skipping GetUserDetails — no userId');
        return;
      }

      const action = patchCredentials(new GetLearnWorldsUserDetailsAction());

      const result = await action.GetUserDetails(
        { CompanyID: COMPANY_ID, UserID: createdUserId, IncludeEnrollments: true, IncludeStats: false },
        contextUser,
      );

      expect(result.UserDetails).toBeDefined();
      expect(result.UserDetails.id).toBe(createdUserId);
      expect(result.UserDetails.email).toBe(TEST_EMAIL);
      console.log(`  GetUserDetails: OK (email=${result.UserDetails.email}, enrollments=${result.UserDetails.enrollments?.length ?? 0})`);
    });

    // ─── GetUserEnrollments ──────────────────────────────────────────
    it('GetUserEnrollments — should list enrollments', async () => {
      if (!createdUserId) {
        console.warn('  Skipping GetUserEnrollments — no userId');
        return;
      }

      const action = patchCredentials(new GetUserEnrollmentsAction());

      const result = await action.GetUserEnrollments(
        { CompanyID: COMPANY_ID, UserID: createdUserId, IncludeCourseDetails: false },
        contextUser,
      );

      expect(result.Enrollments).toBeDefined();
      expect(Array.isArray(result.Enrollments)).toBe(true);
      console.log(`  GetUserEnrollments: OK (${result.TotalCount} enrollments)`);
    });

    // ─── GetUserProgress ─────────────────────────────────────────────
    it('GetUserProgress — should get user progress', async () => {
      if (!createdUserId) {
        console.warn('  Skipping GetUserProgress — no userId');
        return;
      }

      const action = patchCredentials(new GetLearnWorldsUserProgressAction());

      const result = await action.GetUserProgress(
        {
          CompanyID: COMPANY_ID,
          UserID: createdUserId,
          ...(TEST_COURSE_ID ? { CourseID: TEST_COURSE_ID } : {}),
        },
        contextUser,
      );

      expect(result.UserProgress).toBeDefined();
      console.log(`  GetUserProgress: OK (courses=${result.UserProgress.totalCourses}, overall=${result.UserProgress.overallProgressPercentage}%)`);
    });

    // ─── FindUserByEmail (verify) ────────────────────────────────────
    it('FindUserByEmail (verify) — should find the user we created', async () => {
      if (!createdUserId) {
        console.warn('  Skipping FindUserByEmail verify — no userId');
        return;
      }

      const action = patchCredentials(new CreateUserAction());
      action.SetCompanyContext(COMPANY_ID);

      const result = await action.FindUserByEmail(TEST_EMAIL, contextUser);

      expect(result).not.toBeNull();
      expect(result!.email.toLowerCase()).toBe(TEST_EMAIL.toLowerCase());
      console.log(`  FindUserByEmail (verify): OK (found user id=${result!.id})`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4: SSO Login
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 4: SSO Login', () => {
    it('SSOLogin — should generate an SSO URL', async () => {
      const action = patchCredentials(new SSOLoginAction());

      const result = await action.GenerateSSOUrl(
        { CompanyID: COMPANY_ID, Email: TEST_EMAIL },
        contextUser,
      );

      expect(result.LoginURL).toBeTruthy();
      expect(result.LoginURL).toContain('http');
      console.log(`  SSOLogin: OK (loginURL=${result.LoginURL})`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 5: Orchestration — OnboardLearner
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 5: OnboardLearner orchestration', () => {
    it('OnboardLearner — should create user + enroll + SSO in one call', async () => {
      const action = patchCredentials(new OnboardLearnerAction());

      // Patch credentials at the prototype level so inner action instances
      // (CreateUserAction, EnrollUserAction, SSOLoginAction) also get them
      const credentialMock = async () => ({
        CompanyID: COMPANY_ID,
        APIKey: API_KEY,
        ExternalSystemID: SCHOOL_DOMAIN,
        AccessToken: null,
        CustomAttribute1: null,
      });
      const apiCredMock = async () => ({
        apiKey: API_KEY,
        apiSecret: undefined,
        accessToken: undefined,
      });
      vi.spyOn(LearnWorldsBaseAction.prototype as Record<string, unknown>, 'getCompanyIntegration' as never).mockImplementation(credentialMock as never);
      vi.spyOn(LearnWorldsBaseAction.prototype as Record<string, unknown>, 'getAPICredentials' as never).mockImplementation(apiCredMock as never);

      const result = await action.OnboardLearner(
        {
          CompanyID: COMPANY_ID,
          Email: ONBOARD_EMAIL,
          FirstName: 'MJ',
          LastName: 'OnboardTest',
          Role: 'student',
          ...(TEST_COURSE_ID ? { CourseIDs: [TEST_COURSE_ID] } : {}),
          SendWelcomeEmail: false,
        },
        contextUser,
      );

      expect(result.Success).toBe(true);
      expect(result.LearnWorldsUserId).toBeTruthy();
      expect(result.IsNewUser).toBe(true);
      onboardedUserId = result.LearnWorldsUserId;

      console.log(`  OnboardLearner: OK`);
      console.log(`    userId    = ${result.LearnWorldsUserId}`);
      console.log(`    isNewUser = ${result.IsNewUser}`);
      console.log(`    loginURL  = ${result.LoginURL}`);
      console.log(`    enrollments = ${result.Enrollments.length} (${result.Enrollments.filter((e) => e.success).length} succeeded)`);
      if (result.Errors.length > 0) {
        console.log(`    errors    = ${result.Errors.join('; ')}`);
      }
    });

    it('OnboardLearner — should find existing user on second call', async () => {
      if (!onboardedUserId) {
        console.warn('  Skipping OnboardLearner re-run — no onboardedUserId');
        return;
      }

      const action = patchCredentials(new OnboardLearnerAction());

      const result = await action.OnboardLearner(
        {
          CompanyID: COMPANY_ID,
          Email: ONBOARD_EMAIL,
          FirstName: 'MJ',
          LastName: 'OnboardTest',
        },
        contextUser,
      );

      expect(result.IsNewUser).toBe(false);
      expect(result.LearnWorldsUserId).toBe(onboardedUserId);
      console.log(`  OnboardLearner (re-run): OK (isNewUser=false, same userId=${result.LearnWorldsUserId})`);
    });
  });
});
