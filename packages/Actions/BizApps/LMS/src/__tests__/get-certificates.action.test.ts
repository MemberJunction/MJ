import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies (same pattern as get-bundles.action.test.ts)
vi.mock('@memberjunction/actions', () => ({
  BaseAction: class BaseAction {
    protected async InternalRunAction(): Promise<unknown> {
      return {};
    }
  },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
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
    CompanyID: string = '';
    APIKey: string | null = null;
    AccessToken: string | null = null;
    ExternalSystemID: string | null = null;
    CustomAttribute1: string | null = null;
  },
}));

vi.mock('@memberjunction/actions-base', () => ({
  ActionParam: class ActionParam {
    Name: string = '';
    Value: unknown = null;
    Type: string = 'Input';
  },
}));

import { UserInfo } from '@memberjunction/core';
import { GetCertificatesAction } from '../providers/learnworlds/actions/get-certificates.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { FormattedCertificate } from '../providers/learnworlds/interfaces';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Helper to build a raw LW API certificate object matching the LWRawCertificate interface
 */
function createRawApiCertificate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cert-1',
    user_id: 'user-1',
    course_id: 'course-1',
    certificate_number: 'CERT-2024-001',
    issued_at: '2024-06-15T10:00:00Z',
    expires_at: '2025-06-15T10:00:00Z',
    status: 'active',
    grade: 95,
    score: 92,
    completion_percentage: 100,
    user: {
      id: 'user-1',
      email: 'student@example.com',
      first_name: 'Jane',
      last_name: 'Doe',
    },
    course: {
      id: 'course-1',
      title: 'Intro to Testing',
      duration: 3600,
    },
    pdf_url: 'https://example.com/cert.pdf',
    image_url: 'https://example.com/cert.png',
    public_url: 'https://example.com/cert/public',
    verification_url: 'https://example.com/verify/CERT-2024-001',
    verification_code: 'VERIFY-001',
    qr_code_url: 'https://example.com/qr/CERT-2024-001',
    ...overrides,
  };
}

describe('GetCertificatesAction', () => {
  let action: GetCertificatesAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new GetCertificatesAction();
    contextUser = createMockContextUser();
  });

  describe('GetCertificates() typed method', () => {
    it('should get certificates successfully with full data', async () => {
      const rawCert = createRawApiCertificate();

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: [rawCert],
      } as never);

      const result = await action.GetCertificates({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      expect(result.TotalCount).toBe(1);
      expect(result.Certificates).toHaveLength(1);

      const cert: FormattedCertificate = result.Certificates[0];
      expect(cert.id).toBe('cert-1');
      expect(cert.userId).toBe('user-1');
      expect(cert.courseId).toBe('course-1');
      expect(cert.certificateNumber).toBe('CERT-2024-001');
      expect(cert.issuedAt).toBe('2024-06-15T10:00:00Z');
      expect(cert.expiresAt).toBe('2025-06-15T10:00:00Z');
      expect(cert.status).toBe('active');
      expect(cert.grade).toBe(95);
      expect(cert.score).toBe(92);
      expect(cert.completionPercentage).toBe(100);
    });

    it('should format certificate with inline user and course info', async () => {
      const rawCert = createRawApiCertificate();

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: [rawCert],
      } as never);

      const result = await action.GetCertificates({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);
      const cert = result.Certificates[0];

      expect(cert.user).toBeDefined();
      expect(cert.user?.id).toBe('user-1');
      expect(cert.user?.email).toBe('student@example.com');
      expect(cert.user?.name).toBe('Jane Doe');

      expect(cert.course).toBeDefined();
      expect(cert.course?.id).toBe('course-1');
      expect(cert.course?.title).toBe('Intro to Testing');
      expect(cert.course?.duration).toBe(3600);
    });

    it('should include download links by default', async () => {
      const rawCert = createRawApiCertificate();

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: [rawCert],
      } as never);

      const result = await action.GetCertificates({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);
      const cert = result.Certificates[0];

      expect(cert.downloadLinks).toBeDefined();
      expect(cert.downloadLinks?.pdf).toBe('https://example.com/cert.pdf');
      expect(cert.downloadLinks?.image).toBe('https://example.com/cert.png');
      expect(cert.downloadLinks?.publicUrl).toBe('https://example.com/cert/public');
    });

    it('should omit download links when IncludeDownloadLinks is false', async () => {
      const rawCert = createRawApiCertificate();

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: [rawCert],
      } as never);

      const result = await action.GetCertificates(
        { CompanyID: 'comp-1', UserID: 'user-1', IncludeDownloadLinks: false },
        contextUser,
      );
      const cert = result.Certificates[0];

      expect(cert.downloadLinks).toBeUndefined();
    });

    it('should include verification info', async () => {
      const rawCert = createRawApiCertificate();

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: [rawCert],
      } as never);

      const result = await action.GetCertificates({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);
      const cert = result.Certificates[0];

      expect(cert.verification).toBeDefined();
      expect(cert.verification.url).toBe('https://example.com/verify/CERT-2024-001');
      expect(cert.verification.code).toBe('VERIFY-001');
      expect(cert.verification.qrCode).toBe('https://example.com/qr/CERT-2024-001');
    });

    it('should build summary with correct counts and grouping by course when filtering by user', async () => {
      const cert1 = createRawApiCertificate({
        id: 'cert-1',
        course_id: 'course-1',
        course: { id: 'course-1', title: 'Course A' },
        status: 'active',
        expires_at: '2099-12-31T00:00:00Z',
      });
      const cert2 = createRawApiCertificate({
        id: 'cert-2',
        course_id: 'course-2',
        course: { id: 'course-2', title: 'Course B' },
        status: 'active',
        expires_at: '2000-01-01T00:00:00Z', // expired
      });

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: [cert1, cert2],
      } as never);

      const result = await action.GetCertificates({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      expect(result.Summary.totalCertificates).toBe(2);
      expect(result.Summary.activeCertificates).toBe(1);
      expect(result.Summary.expiredCertificates).toBe(1);
      expect(result.Summary.filterType).toBe('user');
      // When filtering by UserID only, certs are grouped by course title
      expect(result.Summary.groupedData).not.toBeNull();
      expect(result.Summary.groupedData?.['Course A']).toHaveLength(1);
      expect(result.Summary.groupedData?.['Course B']).toHaveLength(1);
    });

    it('should build summary grouped by user when filtering by course', async () => {
      const cert1 = createRawApiCertificate({
        id: 'cert-1',
        user_id: 'user-1',
        user: { id: 'user-1', email: 'alice@example.com', first_name: 'Alice', last_name: 'Smith' },
      });
      const cert2 = createRawApiCertificate({
        id: 'cert-2',
        user_id: 'user-2',
        user: { id: 'user-2', email: 'bob@example.com', first_name: 'Bob', last_name: 'Jones' },
      });

      // Mock once for the certificates endpoint, no extra user/course lookups needed (inline data present)
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: [cert1, cert2],
      } as never);

      const result = await action.GetCertificates({ CompanyID: 'comp-1', CourseID: 'course-1' }, contextUser);

      expect(result.Summary.filterType).toBe('course');
      expect(result.Summary.groupedData).not.toBeNull();
      expect(result.Summary.groupedData?.['Alice Smith']).toHaveLength(1);
      expect(result.Summary.groupedData?.['Bob Jones']).toHaveLength(1);
    });

    it('should set filterType to user-course when both UserID and CourseID are provided', async () => {
      const rawCert = createRawApiCertificate();

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: [rawCert],
      } as never);

      const result = await action.GetCertificates(
        { CompanyID: 'comp-1', UserID: 'user-1', CourseID: 'course-1' },
        contextUser,
      );

      expect(result.Summary.filterType).toBe('user-course');
      // No groupedData when both filters are provided
      expect(result.Summary.groupedData).toBeNull();
    });

    it('should handle empty certificates', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: [],
      } as never);

      const result = await action.GetCertificates({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      expect(result.TotalCount).toBe(0);
      expect(result.Certificates).toEqual([]);
      expect(result.Summary.totalCertificates).toBe(0);
      expect(result.Summary.activeCertificates).toBe(0);
      expect(result.Summary.expiredCertificates).toBe(0);
    });

    it('should throw when neither UserID nor CourseID is provided', async () => {
      await expect(action.GetCertificates({ CompanyID: 'comp-1' }, contextUser)).rejects.toThrow(
        'Either UserID or CourseID is required',
      );
    });

    it('should propagate API errors', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: false,
        message: 'Unauthorized',
      } as never);

      await expect(action.GetCertificates({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser)).rejects.toThrow(
        'Unauthorized',
      );
    });

    it('should propagate network errors', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockRejectedValue(new Error('Network timeout') as never);

      await expect(action.GetCertificates({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser)).rejects.toThrow(
        'Network timeout',
      );
    });

    it('should use download_url as fallback for pdf when pdf_url is missing', async () => {
      const rawCert = createRawApiCertificate({
        pdf_url: undefined,
        download_url: 'https://example.com/download/cert.pdf',
      });

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: [rawCert],
      } as never);

      const result = await action.GetCertificates({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      expect(result.Certificates[0].downloadLinks?.pdf).toBe('https://example.com/download/cert.pdf');
    });

    it('should use certificate_url as fallback for publicUrl when public_url is missing', async () => {
      const rawCert = createRawApiCertificate({
        public_url: undefined,
        certificate_url: 'https://example.com/certificate/view',
      });

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: [rawCert],
      } as never);

      const result = await action.GetCertificates({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      expect(result.Certificates[0].downloadLinks?.publicUrl).toBe('https://example.com/certificate/view');
    });

    it('should use certificate_id as fallback when id is missing', async () => {
      const rawCert = createRawApiCertificate({ id: undefined, certificate_id: 'alt-cert-id' });

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: [rawCert],
      } as never);

      const result = await action.GetCertificates({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      expect(result.Certificates[0].id).toBe('alt-cert-id');
    });

    it('should handle nested data shape from API response', async () => {
      const rawCert = createRawApiCertificate();

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: { data: [rawCert] },
      } as never);

      const result = await action.GetCertificates({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      expect(result.TotalCount).toBe(1);
      expect(result.Certificates[0].id).toBe('cert-1');
    });

    it('should handle single-certificate object response', async () => {
      const rawCert = createRawApiCertificate();

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        success: true,
        data: rawCert, // single object, not array
      } as never);

      const result = await action.GetCertificates(
        { CompanyID: 'comp-1', UserID: 'user-1', CourseID: 'course-1' },
        contextUser,
      );

      expect(result.TotalCount).toBe(1);
      expect(result.Certificates[0].id).toBe('cert-1');
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when GetCertificates succeeds', async () => {
      const mockCertificates: FormattedCertificate[] = [
        {
          id: 'cert-1',
          userId: 'user-1',
          courseId: 'course-1',
          certificateNumber: 'CERT-001',
          issuedAt: '2024-06-15T10:00:00Z',
          status: 'active',
          completionPercentage: 100,
          verification: { url: undefined, code: undefined, qrCode: undefined },
        },
        {
          id: 'cert-2',
          userId: 'user-1',
          courseId: 'course-2',
          certificateNumber: 'CERT-002',
          issuedAt: '2024-07-01T10:00:00Z',
          status: 'active',
          completionPercentage: 100,
          verification: { url: undefined, code: undefined, qrCode: undefined },
        },
      ];

      vi.spyOn(action, 'GetCertificates').mockResolvedValue({
        Certificates: mockCertificates,
        TotalCount: 2,
        Summary: {
          totalCertificates: 2,
          activeCertificates: 2,
          expiredCertificates: 0,
          dateRange: { from: 'all-time', to: 'current' },
          filterType: 'user',
          groupedData: null,
        },
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-1' },
          { Name: 'CourseID', Type: 'Input', Value: undefined },
          { Name: 'IncludeDownloadLinks', Type: 'Input', Value: true },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Retrieved 2 certificate(s)');
    });

    it('should return error result when GetCertificates throws', async () => {
      vi.spyOn(action, 'GetCertificates').mockRejectedValue(new Error('API connection failed'));

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-1' },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Error retrieving certificates');
      expect(result.Message).toContain('API connection failed');
    });
  });
});
