import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { GetCertificatesParams, GetCertificatesResult, FormattedCertificate, CertificatesSummary } from '../interfaces';

// ----------------------------------------------------------------
// File-local interfaces for raw LearnWorlds API shapes
// ----------------------------------------------------------------

/** Query parameters sent to the certificates endpoint */
interface LWCertificateQueryParams {
  limit: number;
  sort: string;
  order: string;
  issued_after?: string;
  issued_before?: string;
  [key: string]: string | number | boolean | undefined;
}

/** Raw certificate data from the LearnWorlds API */
interface LWRawCertificate {
  id?: string;
  certificate_id?: string;
  user_id?: string;
  course_id?: string;
  certificate_number?: string;
  number?: string;
  issued_at?: string;
  created_at?: string;
  expires_at?: string;
  status?: string;
  grade?: number;
  score?: number;
  completion_percentage?: number;
  user?: {
    id?: string;
    email?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  course?: {
    id?: string;
    title?: string;
    duration?: number;
  };
  pdf_url?: string;
  download_url?: string;
  image_url?: string;
  public_url?: string;
  certificate_url?: string;
  verification_url?: string;
  verification_code?: string;
  qr_code_url?: string;
}

/** Wrapper response that may contain a data array */
interface LWCertificatesApiResponse {
  success?: boolean;
  message?: string;
  data?: LWRawCertificate[] | LWCertificatesNestedData | LWRawCertificate;
}

/** Nested data shape when the API wraps certificates inside .data.data */
interface LWCertificatesNestedData {
  data?: LWRawCertificate[];
  id?: string;
  [key: string]: unknown;
}

/** User lookup response */
interface LWUserLookup {
  success?: boolean;
  data?: {
    id?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
}

/** Course lookup response */
interface LWCourseLookup {
  success?: boolean;
  data?: {
    id?: string;
    title?: string;
    duration?: number;
  };
}

/**
 * Action to retrieve certificates earned by users in LearnWorlds
 */
@RegisterClass(BaseAction, 'GetCertificatesAction')
export class GetCertificatesAction extends LearnWorldsBaseAction {
  // ----------------------------------------------------------------
  // Typed public method – can be called directly from code
  // ----------------------------------------------------------------

  /**
   * Get certificates for a user or course.
   * Throws on any error.
   */
  public async GetCertificates(params: GetCertificatesParams, contextUser: UserInfo): Promise<GetCertificatesResult> {
    this.SetCompanyContext(params.CompanyID);

    const {
      UserID: userId,
      CourseID: courseId,
      DateFrom: dateFrom,
      DateTo: dateTo,
      IncludeDownloadLinks: includeDownloadLinksRaw,
      SortBy: sortBy = 'issued_at',
      SortOrder: sortOrder = 'desc',
      MaxResults: maxResults = 100,
    } = params;

    const includeDownloadLinks = includeDownloadLinksRaw !== false;

    // Require either userId or courseId
    if (!userId && !courseId) {
      throw new Error('Either UserID or CourseID is required');
    }

    // Build query parameters
    const queryParams: LWCertificateQueryParams = {
      limit: Math.min(maxResults, 100),
      sort: sortBy,
      order: sortOrder,
    };

    if (dateFrom) {
      queryParams.issued_after = new Date(dateFrom).toISOString();
    }
    if (dateTo) {
      queryParams.issued_before = new Date(dateTo).toISOString();
    }

    // Determine endpoint based on parameters
    const endpoint = this.buildCertificatesEndpoint(userId, courseId);

    // Build query string
    const queryString = this.buildQueryString(queryParams);

    // Get certificates
    const certificatesResponse = await this.makeLearnWorldsRequest<LWCertificatesApiResponse>(endpoint + queryString, 'GET', null, contextUser);

    if (certificatesResponse.success === false) {
      throw new Error(certificatesResponse.message || 'Failed to retrieve certificates');
    }

    // Handle single certificate vs array
    const certificatesArray = this.extractCertificatesArray(certificatesResponse);

    // Process each certificate
    const formattedCertificates = await this.processCertificates(certificatesArray, userId, courseId, includeDownloadLinks, contextUser);

    // Calculate summary
    const summary = this.buildCertificatesSummary(formattedCertificates, userId, courseId, dateFrom, dateTo);

    return {
      Certificates: formattedCertificates,
      TotalCount: formattedCertificates.length,
      Summary: summary,
    };
  }

  // ----------------------------------------------------------------
  // Framework wrapper – thin delegation to the public method
  // ----------------------------------------------------------------

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const typedParams = this.extractCertificatesParams(Params);
      const result = await this.GetCertificates(typedParams, ContextUser);

      this.setOutputParam(Params, 'Certificates', result.Certificates);
      this.setOutputParam(Params, 'TotalCount', result.TotalCount);
      this.setOutputParam(Params, 'Summary', result.Summary);

      return this.buildSuccessResult(`Retrieved ${result.TotalCount} certificate(s)`, Params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return this.buildErrorResult('ERROR', `Error retrieving certificates: ${msg}`, Params);
    }
  }

  // ----------------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------------

  private extractCertificatesParams(params: ActionParam[]): GetCertificatesParams {
    return {
      CompanyID: this.getParamValue(params, 'CompanyID') as string,
      UserID: this.getParamValue(params, 'UserID') as string | undefined,
      CourseID: this.getParamValue(params, 'CourseID') as string | undefined,
      DateFrom: this.getParamValue(params, 'DateFrom') as string | undefined,
      DateTo: this.getParamValue(params, 'DateTo') as string | undefined,
      IncludeDownloadLinks: this.getParamValue(params, 'IncludeDownloadLinks') as boolean | undefined,
      SortBy: this.getParamValue(params, 'SortBy') as string | undefined,
      SortOrder: this.getParamValue(params, 'SortOrder') as 'asc' | 'desc' | undefined,
      MaxResults: this.getParamValue(params, 'MaxResults') as number | undefined,
    };
  }

  private buildCertificatesEndpoint(userId?: string, courseId?: string): string {
    if (userId && courseId) {
      return `/users/${userId}/courses/${courseId}/certificate`;
    } else if (userId) {
      return `/users/${userId}/certificates`;
    } else if (courseId) {
      return `/courses/${courseId}/certificates`;
    }
    return '/certificates';
  }

  private buildQueryString(queryParams: Record<string, string | number | boolean | undefined>): string {
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        filtered[key] = String(value);
      }
    }
    const keys = Object.keys(filtered);
    if (keys.length === 0) return '';
    return '?' + new URLSearchParams(filtered).toString();
  }

  private extractCertificatesArray(response: LWCertificatesApiResponse): LWRawCertificate[] {
    const rawData = response.data;
    if (Array.isArray(rawData)) {
      return rawData;
    }
    if (rawData && typeof rawData === 'object') {
      const nested = rawData as LWCertificatesNestedData;
      if (Array.isArray(nested.data)) {
        return nested.data;
      }
      if (nested.id) {
        return [rawData as LWRawCertificate];
      }
    }
    return [];
  }

  private async processCertificates(
    certificatesArray: LWRawCertificate[],
    userId: string | undefined,
    courseId: string | undefined,
    includeDownloadLinks: boolean,
    contextUser: UserInfo,
  ): Promise<FormattedCertificate[]> {
    const formatted: FormattedCertificate[] = [];

    for (const cert of certificatesArray) {
      const formattedCert = this.buildBaseCertificate(cert, userId, courseId);

      // Attach user info
      formattedCert.user = await this.resolveUserInfo(cert, userId, contextUser);

      // Attach course info
      formattedCert.course = await this.resolveCourseInfo(cert, courseId, contextUser);

      // Attach download links if requested
      if (includeDownloadLinks) {
        formattedCert.downloadLinks = {
          pdf: cert.pdf_url || cert.download_url,
          image: cert.image_url,
          publicUrl: cert.public_url || cert.certificate_url,
        };
      }

      // Attach verification info
      formattedCert.verification = {
        url: cert.verification_url,
        code: cert.verification_code,
        qrCode: cert.qr_code_url,
      };

      formatted.push(formattedCert);
    }

    return formatted;
  }

  private buildBaseCertificate(cert: LWRawCertificate, userId: string | undefined, courseId: string | undefined): FormattedCertificate {
    return {
      id: cert.id || cert.certificate_id || '',
      userId: cert.user_id || userId || '',
      courseId: cert.course_id || courseId || '',
      certificateNumber: cert.certificate_number || cert.number,
      issuedAt: cert.issued_at || cert.created_at,
      expiresAt: cert.expires_at,
      status: cert.status || 'active',
      grade: cert.grade,
      score: cert.score,
      completionPercentage: cert.completion_percentage || 100,
      verification: { url: undefined, code: undefined, qrCode: undefined },
    };
  }

  private async resolveUserInfo(
    cert: LWRawCertificate,
    filterUserId: string | undefined,
    contextUser: UserInfo,
  ): Promise<{ id: string; email: string; name: string } | undefined> {
    if (cert.user) {
      return {
        id: cert.user.id || cert.user_id || '',
        email: cert.user.email || '',
        name: cert.user.name || `${cert.user.first_name || ''} ${cert.user.last_name || ''}`.trim(),
      };
    }

    if (!filterUserId && cert.user_id) {
      const userResponse = await this.makeLearnWorldsRequest<LWUserLookup>(`/users/${cert.user_id}`, 'GET', null, contextUser);

      if (userResponse.success !== false && userResponse.data) {
        const user = userResponse.data;
        return {
          id: user.id || '',
          email: user.email || '',
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || '',
        };
      }
    }

    return undefined;
  }

  private async resolveCourseInfo(
    cert: LWRawCertificate,
    filterCourseId: string | undefined,
    contextUser: UserInfo,
  ): Promise<{ id: string; title: string; duration?: number } | undefined> {
    if (cert.course) {
      return {
        id: cert.course.id || cert.course_id || '',
        title: cert.course.title || '',
        duration: cert.course.duration,
      };
    }

    if (!filterCourseId && cert.course_id) {
      const courseResponse = await this.makeLearnWorldsRequest<LWCourseLookup>(`/courses/${cert.course_id}`, 'GET', null, contextUser);

      if (courseResponse.success !== false && courseResponse.data) {
        const course = courseResponse.data;
        return {
          id: course.id || '',
          title: course.title || '',
          duration: course.duration,
        };
      }
    }

    return undefined;
  }

  private buildCertificatesSummary(
    certificates: FormattedCertificate[],
    userId: string | undefined,
    courseId: string | undefined,
    dateFrom: string | undefined,
    dateTo: string | undefined,
  ): CertificatesSummary {
    const totalCertificates = certificates.length;
    const now = new Date();

    const activeCertificates = certificates.filter((c) => c.status === 'active' && (!c.expiresAt || new Date(c.expiresAt) > now)).length;

    const expiredCertificates = certificates.filter((c) => c.expiresAt && new Date(c.expiresAt) <= now).length;

    // Group by course or user depending on the filter
    let groupedData: Record<string, FormattedCertificate[]> | null = null;

    if (userId && !courseId) {
      groupedData = this.groupCertificatesByCourse(certificates);
    } else if (courseId && !userId) {
      groupedData = this.groupCertificatesByUser(certificates);
    }

    const filterType = userId && courseId ? 'user-course' : userId ? 'user' : 'course';

    return {
      totalCertificates,
      activeCertificates,
      expiredCertificates,
      dateRange: {
        from: dateFrom || 'all-time',
        to: dateTo || 'current',
      },
      filterType,
      groupedData,
    };
  }

  private groupCertificatesByCourse(certificates: FormattedCertificate[]): Record<string, FormattedCertificate[]> {
    const grouped: Record<string, FormattedCertificate[]> = {};
    for (const cert of certificates) {
      const courseTitle = cert.course?.title || 'Unknown Course';
      if (!grouped[courseTitle]) {
        grouped[courseTitle] = [];
      }
      grouped[courseTitle].push(cert);
    }
    return grouped;
  }

  private groupCertificatesByUser(certificates: FormattedCertificate[]): Record<string, FormattedCertificate[]> {
    const grouped: Record<string, FormattedCertificate[]> = {};
    for (const cert of certificates) {
      const userName = cert.user?.name || cert.user?.email || 'Unknown User';
      if (!grouped[userName]) {
        grouped[userName] = [];
      }
      grouped[userName].push(cert);
    }
    return grouped;
  }

  // ----------------------------------------------------------------
  // Params & Description metadata
  // ----------------------------------------------------------------

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();
    const specificParams: ActionParam[] = [
      { Name: 'UserID', Type: 'Input', Value: null },
      { Name: 'CourseID', Type: 'Input', Value: null },
      { Name: 'DateFrom', Type: 'Input', Value: null },
      { Name: 'DateTo', Type: 'Input', Value: null },
      { Name: 'IncludeDownloadLinks', Type: 'Input', Value: true },
      { Name: 'SortBy', Type: 'Input', Value: 'issued_at' },
      { Name: 'SortOrder', Type: 'Input', Value: 'desc' },
      { Name: 'MaxResults', Type: 'Input', Value: 100 },
      { Name: 'Certificates', Type: 'Output', Value: null },
      { Name: 'TotalCount', Type: 'Output', Value: null },
      { Name: 'Summary', Type: 'Output', Value: null },
    ];
    return [...baseParams, ...specificParams];
  }

  /**
   * Metadata about this action
   */
  public get Description(): string {
    return 'Retrieves certificates earned by users in LearnWorlds courses with download links and verification info';
  }
}
