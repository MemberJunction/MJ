import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to retrieve certificates earned by users in LearnWorlds
 */
@RegisterClass(LearnWorldsBaseAction, 'GetCertificatesAction')
export class GetCertificatesAction extends LearnWorldsBaseAction {
    /**
     * Get certificates for a user or course
     */
    public async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params;
        
        try {
            // Extract and validate parameters
            const userId = this.getParamValue(Params, 'UserID');
            const courseId = this.getParamValue(Params, 'CourseID');
            const dateFrom = this.getParamValue(Params, 'DateFrom');
            const dateTo = this.getParamValue(Params, 'DateTo');
            const includeDownloadLinks = this.getParamValue(Params, 'IncludeDownloadLinks') !== false;
            const sortBy = this.getParamValue(Params, 'SortBy') || 'issued_at';
            const sortOrder = this.getParamValue(Params, 'SortOrder') || 'desc';
            const maxResults = this.getParamValue(Params, 'MaxResults') || 100;
            
            // Require either userId or courseId
            if (!userId && !courseId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Either UserID or CourseID is required',
                    Params
                };
            }


            // Build query parameters
            const queryParams: any = {
                limit: Math.min(maxResults, 100),
                sort: sortBy,
                order: sortOrder
            };

            if (dateFrom) {
                queryParams.issued_after = new Date(dateFrom).toISOString();
            }
            if (dateTo) {
                queryParams.issued_before = new Date(dateTo).toISOString();
            }

            // Determine endpoint based on parameters
            let endpoint = '/certificates';
            if (userId && courseId) {
                // Get specific certificate for user/course combination
                endpoint = `/users/${userId}/courses/${courseId}/certificate`;
            } else if (userId) {
                // Get all certificates for a user
                endpoint = `/users/${userId}/certificates`;
            } else if (courseId) {
                // Get all certificates issued for a course
                endpoint = `/courses/${courseId}/certificates`;
            }

            // Build query string
            const queryString = Object.keys(queryParams).length > 0 
                ? '?' + new URLSearchParams(queryParams).toString()
                : '';

            // Get certificates
            const certificatesResponse = await this.makeLearnWorldsRequest(
                endpoint + queryString,
                'GET',
                null,
                ContextUser
            );

            if (!certificatesResponse.success) {
                return {
                    Success: false,
                    ResultCode: 'API_ERROR',
                    Message: certificatesResponse.message || 'Failed to retrieve certificates',
                    Params
                };
            }

            // Handle single certificate vs array
            const rawData = certificatesResponse.data;
            const certificatesArray = Array.isArray(rawData) 
                ? rawData 
                : (rawData?.data || (rawData?.id ? [rawData] : []));

            const formattedCertificates: any[] = [];

            // Process each certificate
            for (const cert of certificatesArray) {
                const formattedCert: any = {
                    id: cert.id || cert.certificate_id,
                    userId: cert.user_id || userId,
                    courseId: cert.course_id || courseId,
                    certificateNumber: cert.certificate_number || cert.number,
                    issuedAt: cert.issued_at || cert.created_at,
                    expiresAt: cert.expires_at,
                    status: cert.status || 'active',
                    grade: cert.grade,
                    score: cert.score,
                    completionPercentage: cert.completion_percentage || 100
                };

                // Add user info if available
                if (cert.user) {
                    formattedCert.user = {
                        id: cert.user.id || cert.user_id,
                        email: cert.user.email,
                        name: cert.user.name || `${cert.user.first_name || ''} ${cert.user.last_name || ''}`.trim()
                    };
                } else if (!userId && cert.user_id) {
                    // Try to get user info
                    const userResponse = await this.makeLearnWorldsRequest(
                        `/users/${cert.user_id}`,
                        'GET',
                        null,
                        ContextUser
                    );
                    
                    if (userResponse.success && userResponse.data) {
                        const user = userResponse.data;
                        formattedCert.user = {
                            id: user.id,
                            email: user.email,
                            name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username
                        };
                    }
                }

                // Add course info if available
                if (cert.course) {
                    formattedCert.course = {
                        id: cert.course.id || cert.course_id,
                        title: cert.course.title,
                        duration: cert.course.duration
                    };
                } else if (!courseId && cert.course_id) {
                    // Try to get course info
                    const courseResponse = await this.makeLearnWorldsRequest(
                        `/courses/${cert.course_id}`,
                        'GET',
                        null,
                        ContextUser
                    );
                    
                    if (courseResponse.success && courseResponse.data) {
                        const course = courseResponse.data;
                        formattedCert.course = {
                            id: course.id,
                            title: course.title,
                            duration: course.duration
                        };
                    }
                }

                // Add download links if requested
                if (includeDownloadLinks) {
                    formattedCert.downloadLinks = {
                        pdf: cert.pdf_url || cert.download_url,
                        image: cert.image_url,
                        publicUrl: cert.public_url || cert.certificate_url
                    };
                }

                // Add verification info
                formattedCert.verification = {
                    url: cert.verification_url,
                    code: cert.verification_code,
                    qrCode: cert.qr_code_url
                };

                formattedCertificates.push(formattedCert);
            }

            // Calculate summary statistics
            const totalCertificates = formattedCertificates.length;
            const activeCertificates = formattedCertificates.filter(c => 
                c.status === 'active' && (!c.expiresAt || new Date(c.expiresAt) > new Date())
            ).length;
            const expiredCertificates = formattedCertificates.filter(c => 
                c.expiresAt && new Date(c.expiresAt) <= new Date()
            ).length;

            // Group by course if getting user certificates
            const certificatesByCourse: any = {};
            if (userId && !courseId) {
                formattedCertificates.forEach(cert => {
                    const courseTitle = cert.course?.title || 'Unknown Course';
                    if (!certificatesByCourse[courseTitle]) {
                        certificatesByCourse[courseTitle] = [];
                    }
                    certificatesByCourse[courseTitle].push(cert);
                });
            }

            // Group by user if getting course certificates
            const certificatesByUser: any = {};
            if (courseId && !userId) {
                formattedCertificates.forEach(cert => {
                    const userName = cert.user?.name || cert.user?.email || 'Unknown User';
                    if (!certificatesByUser[userName]) {
                        certificatesByUser[userName] = [];
                    }
                    certificatesByUser[userName].push(cert);
                });
            }

            // Create summary
            const summary = {
                totalCertificates: totalCertificates,
                activeCertificates: activeCertificates,
                expiredCertificates: expiredCertificates,
                dateRange: {
                    from: dateFrom || 'all-time',
                    to: dateTo || 'current'
                },
                filterType: userId && courseId ? 'user-course' : (userId ? 'user' : 'course'),
                groupedData: userId && !courseId ? certificatesByCourse : (courseId && !userId ? certificatesByUser : null)
            };

            // Update output parameters
            const outputParams = [...Params];
            const certificatesParam = outputParams.find(p => p.Name === 'Certificates');
            if (certificatesParam) {
                certificatesParam.Value = formattedCertificates;
            }
            const totalCountParam = outputParams.find(p => p.Name === 'TotalCount');
            if (totalCountParam) {
                totalCountParam.Value = totalCertificates;
            }
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) {
                summaryParam.Value = summary;
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Retrieved ${totalCertificates} certificate(s)`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                Message: `Error retrieving certificates: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        const baseParams = this.getCommonLMSParams();
        const specificParams: ActionParam[] = [
            {
                Name: 'UserID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CourseID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DateFrom',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DateTo',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeDownloadLinks',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'SortBy',
                Type: 'Input',
                Value: 'issued_at'
            },
            {
                Name: 'SortOrder',
                Type: 'Input',
                Value: 'desc'
            },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'Certificates',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'TotalCount',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Summary',
                Type: 'Output',
                Value: null
            }
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