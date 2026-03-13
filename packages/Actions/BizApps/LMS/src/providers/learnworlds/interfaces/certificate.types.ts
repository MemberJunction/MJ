import { LearnWorldsBaseParams } from './common.types';

/**
 * Parameters for the GetCertificates action
 */
export interface GetCertificatesParams extends LearnWorldsBaseParams {
  UserID?: string;
  CourseID?: string;
  DateFrom?: string;
  DateTo?: string;
  IncludeDownloadLinks?: boolean;
  SortBy?: string;
  SortOrder?: 'asc' | 'desc';
  MaxResults?: number;
}

/**
 * Result of the GetCertificates action
 */
export interface GetCertificatesResult {
  Certificates: FormattedCertificate[];
  TotalCount: number;
  Summary: CertificatesSummary;
}

export interface FormattedCertificate {
  id: string;
  userId: string;
  courseId: string;
  certificateNumber?: string;
  issuedAt?: string;
  expiresAt?: string;
  status: string;
  grade?: number;
  score?: number;
  completionPercentage: number;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  course?: {
    id: string;
    title: string;
    duration?: number;
  };
  downloadLinks?: {
    pdf?: string;
    image?: string;
    publicUrl?: string;
  };
  verification: {
    url?: string;
    code?: string;
    qrCode?: string;
  };
}

export interface CertificatesSummary {
  totalCertificates: number;
  activeCertificates: number;
  expiredCertificates: number;
  dateRange: {
    from: string;
    to: string;
  };
  filterType: string;
  groupedData: Record<string, FormattedCertificate[]> | null;
}
