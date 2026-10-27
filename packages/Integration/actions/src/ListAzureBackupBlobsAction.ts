import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseIntegrationAction } from './BaseIntegrationAction.js';

export interface AzureBlobItem {
    Name: string;
    Url: string;
    SizeBytes: number;
    LastModified: string;
}

/**
 * Decodes XML entities.
 */
function decodeXml(str: string): string {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

/**
 * Parses the Azure Blob Storage List Blobs XML response into AzureBlobItem[].
 */
export function parseAzureListBlobsXml(xml: string, containerUrl: string): { blobs: AzureBlobItem[]; nextMarker?: string } {
    const blobs: AzureBlobItem[] = [];
    const cleanBaseUrl = containerUrl.replace(/\/+$/, '');

    // Extract next marker if present
    const markerMatch = /<NextMarker>([\s\S]*?)<\/NextMarker>/i.exec(xml);
    const nextMarker = markerMatch && markerMatch[1].trim().length > 0 ? markerMatch[1].trim() : undefined;

    const blobRegex = /<Blob>([\s\S]*?)<\/Blob>/gi;
    let match: RegExpExecArray | null;

    while ((match = blobRegex.exec(xml)) !== null) {
        const blobContent = match[1];

        const nameMatch = /<Name>([\s\S]*?)<\/Name>/i.exec(blobContent);
        if (!nameMatch) continue;
        const name = decodeXml(nameMatch[1].trim());

        const lengthMatch = /<Content-Length>([\s\S]*?)<\/Content-Length>/i.exec(blobContent);
        const sizeBytes = lengthMatch ? parseInt(lengthMatch[1].trim(), 10) : 0;

        const modifiedMatch = /<Last-Modified>([\s\S]*?)<\/Last-Modified>/i.exec(blobContent);
        let lastModified = '';
        if (modifiedMatch) {
            const parsedDate = new Date(modifiedMatch[1].trim());
            lastModified = isNaN(parsedDate.getTime()) ? modifiedMatch[1].trim() : parsedDate.toISOString();
        }

        const encodedPath = name.split('/').map(encodeURIComponent).join('/');
        const url = `${cleanBaseUrl}/${encodedPath}`;

        blobs.push({
            Name: name,
            Url: url,
            SizeBytes: isNaN(sizeBytes) ? 0 : sizeBytes,
            LastModified: lastModified,
        });
    }

    return { blobs, nextMarker };
}

/**
 * Action that queries an Azure Blob Storage container via the Azure Storage REST API
 * to list available backup blobs.
 *
 * Parameters (Input):
 *   - ContainerUrl (required): Azure Blob Storage container URL (e.g. https://storage.blob.core.windows.net/backups)
 *   - SasToken (optional): Shared Access Signature token for container access
 *   - CredentialID (optional): MJ Credentials record ID storing the SAS token
 *   - Prefix (optional): Optional prefix to filter blob names (e.g. "mydb_backup_")
 *
 * Parameters (Output):
 *   - Blobs: JSON-serialized array of { Name, Url, SizeBytes, LastModified }
 *   - BlobCount: Total number of blobs found
 */
@RegisterClass(BaseAction, 'List Azure Backup Blobs')
export class ListAzureBackupBlobsAction extends BaseIntegrationAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const containerUrl = this.getStringParam(params, 'ContainerUrl');
            if (!containerUrl) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: "Parameter 'ContainerUrl' is required.",
                    Params: params.Params,
                };
            }

            if (!this.IsUrl(containerUrl)) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_PARAMETER',
                    Message: "Parameter 'ContainerUrl' must be a valid HTTP/HTTPS URL.",
                    Params: params.Params,
                };
            }

            let sasToken = '';
            try {
                sasToken = await this.resolveSasToken(params);
            } catch {
                // SAS token is optional if the container allows public/anonymous read
                sasToken = '';
            }

            const prefix = this.getStringParam(params, 'Prefix');
            const cleanSas = sasToken.replace(/^\?/, '').trim();
            const cleanContainerUrl = containerUrl.replace(/\/+$/, '');

            LogStatus(`[ListAzureBackupBlobsAction] Querying container '${cleanContainerUrl}' with prefix '${prefix ?? ''}'...`);

            const allBlobs: AzureBlobItem[] = [];
            let currentMarker: string | undefined = undefined;
            const maxPages = 50; // Safety cap
            let pageCount = 0;

            do {
                pageCount++;
                let apiUrl = `${cleanContainerUrl}?restype=container&comp=list`;
                if (prefix) {
                    apiUrl += `&prefix=${encodeURIComponent(prefix)}`;
                }
                if (currentMarker) {
                    apiUrl += `&marker=${encodeURIComponent(currentMarker)}`;
                }
                if (cleanSas) {
                    apiUrl += `&${cleanSas}`;
                }

                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'x-ms-version': '2021-08-06',
                    },
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    LogError(`[ListAzureBackupBlobsAction] Azure REST API error (${response.status} ${response.statusText}): ${errorText}`);
                    return {
                        Success: false,
                        ResultCode: 'LIST_BLOBS_FAILED',
                        Message: `Azure Storage API error (${response.status} ${response.statusText}): ${errorText}`,
                        Params: params.Params,
                    };
                }

                const responseXml = await response.text();
                const parseResult = parseAzureListBlobsXml(responseXml, cleanContainerUrl);
                allBlobs.push(...parseResult.blobs);
                currentMarker = parseResult.nextMarker;

            } while (currentMarker && pageCount < maxPages);

            const blobsJson = JSON.stringify(allBlobs);
            this.addOutputParam(params, 'Blobs', blobsJson);
            this.addOutputParam(params, 'BlobCount', allBlobs.length);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${allBlobs.length} blob(s) in container '${cleanContainerUrl}'.`,
                Params: params.Params,
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`[ListAzureBackupBlobsAction] Unexpected error: ${message}`);
            return {
                Success: false,
                ResultCode: 'LIST_BLOBS_FAILED',
                Message: message,
                Params: params.Params,
            };
        }
    }
}
