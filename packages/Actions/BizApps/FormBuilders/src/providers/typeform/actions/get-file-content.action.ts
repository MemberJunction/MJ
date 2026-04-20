import { RegisterClass } from '@memberjunction/global';
import { TypeformBaseAction } from '../typeform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { LogError, LogStatus } from '@memberjunction/core';
import axios, { AxiosResponse } from 'axios';
import { FileContentProcessor } from '../../../shared/file-content-processor';

/**
 * Action to download file content from Typeform using file URL
 * 
 * This action retrieves the actual file content from Typeform's file storage
 * using the file_url that comes in response data. It handles authentication
 * and returns the file content in various formats for processing.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Typeform File Content',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: '12345'
 *   }, {
 *     Name: 'FileURL',
 *     Value: 'https://api.typeform.com/responses/files/abc123/download.pdf'
 *   }, {
 *     Name: 'Format',
 *     Value: 'text'
 *   }]
 * });
 * ```
 * 
 * Format Options:
 * - 'auto' (default): Intelligent content extraction based on file type
 * - 'text': Force text extraction when possible
 * - 'base64': Return raw base64 encoded content
 * - 'raw': Return raw binary content as base64
 */
@RegisterClass(BaseAction, 'TypeformGetFileContentAction')
export class GetTypeformFileContentAction extends TypeformBaseAction {

    public get Description(): string {
        return 'Downloads file content from Typeform using the file URL from response data. Features intelligent content extraction for PDFs, Office documents, images, and text files. Supports auto, text, base64, and raw output formats.';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_CONTEXT_USER',
                    Message: 'Context user is required for Typeform API calls'
                };
            }

            const companyId = this.getParamValue(params.Params, 'CompanyID');
            const fileUrl = this.getParamValue(params.Params, 'FileURL');
            const format = this.getParamValue(params.Params, 'Format') || 'auto';

            if (!fileUrl) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_FILE_URL',
                    Message: 'FileURL parameter is required'
                };
            }

            // Validate format parameter
            const validFormats = ['auto', 'text', 'base64', 'raw'];
            if (!validFormats.includes(format)) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_FORMAT',
                    Message: `Format must be one of: ${validFormats.join(', ')}`
                };
            }


            // Securely retrieve API token using company integration
            const apiToken = await this.getSecureAPIToken(companyId, contextUser);
            if (!apiToken) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_API_TOKEN',
                    Message: 'Could not retrieve Typeform API token. Please check your company integration settings.'
                };
            }

            LogStatus(`Downloading file from Typeform: ${fileUrl}`);

            // Download file content with authentication
            const response: AxiosResponse<ArrayBuffer> = await axios.get(fileUrl, {
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Accept': this.getAcceptHeader(format)
                },
                responseType: 'arraybuffer',
                timeout: 30000 // 30 second timeout for file downloads
            });

            // Extract file metadata from response headers
            const contentType = response.headers['content-type'] || 'application/octet-stream';
            const contentLength = response.headers['content-length'] || response.data.byteLength;
            const filename = FileContentProcessor.extractFilename(fileUrl, response.headers['content-disposition']);

            // Process file content using the helper
            const processResult = await FileContentProcessor.processContent(
                Buffer.from(response.data),
                contentType,
                {
                    format: format as any,
                    includeWarnings: true,
                    maxFileSize: 50 * 1024 * 1024 // 50MB limit
                }
            );

            if (!processResult.success) {
                return {
                    Success: false,
                    ResultCode: 'PROCESSING_ERROR',
                    Message: `Failed to process file content: ${processResult.error}`
                };
            }

            const outputParams: ActionParam[] = [
                {
                    Name: 'Content',
                    Type: 'Output',
                    Value: processResult.content
                },
                {
                    Name: 'ContentType',
                    Type: 'Output',
                    Value: processResult.contentType
                },
                {
                    Name: 'ContentFormat',
                    Type: 'Output',
                    Value: processResult.format
                },
                {
                    Name: 'Size',
                    Type: 'Output',
                    Value: processResult.size
                },
                {
                    Name: 'Filename',
                    Type: 'Output',
                    Value: filename
                },
                {
                    Name: 'ExtractionMethod',
                    Type: 'Output',
                    Value: processResult.extractionMethod
                }
            ];

            // Add warning if present
            if (processResult.warning) {
                outputParams.push({
                    Name: 'Warning',
                    Type: 'Output',
                    Value: processResult.warning
                });
            }

            for (const outputParam of outputParams) {
                const existingParam = params.Params.find(p => p.Name === outputParam.Name);
                if (existingParam) {
                    existingParam.Value = outputParam.Value;
                } else {
                    params.Params.push(outputParam);
                }
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully downloaded file ${filename} (${contentLength} bytes) from Typeform`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            LogError('Failed to download Typeform file:', error);
            
            // Handle specific error cases
            if (axios.isAxiosError(error)) {
                const axiosError = error as any;
                const status = axiosError.response?.status;
                
                if (status === 401) {
                    return {
                        Success: false,
                        ResultCode: 'UNAUTHORIZED',
                        Message: 'Invalid Typeform API token or insufficient permissions to access file'
                    };
                } else if (status === 404) {
                    return {
                        Success: false,
                        ResultCode: 'FILE_NOT_FOUND',
                        Message: 'File not found or has been removed from Typeform'
                    };
                } else if (status === 413) {
                    return {
                        Success: false,
                        ResultCode: 'FILE_TOO_LARGE',
                        Message: 'File is too large to download (Typeform limit: 256MB)'
                    };
                } else if (status === 429) {
                    return {
                        Success: false,
                        ResultCode: 'RATE_LIMITED',
                        Message: 'Typeform API rate limit exceeded. Please try again later.'
                    };
                }
            }

            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get Typeform File Content', errorMessage, error)
            };
        }
    }

    /**
     * Get appropriate Accept header based on requested format
     */
    private getAcceptHeader(format: string): string {
        switch (format) {
            case 'text':
                return 'text/*, application/*, */*';
            case 'raw':
            case 'base64':
                return 'application/octet-stream, */*';
            case 'auto':
            default:
                return '*/*';
        }
    }

    public get Params(): ActionParam[] {
        return [
            {
                Name: 'CompanyID',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'FileURL',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'Format',
                Type: 'Input',
                Value: 'auto', // Options: auto, text, base64, raw
            }
        ];
    }
}
