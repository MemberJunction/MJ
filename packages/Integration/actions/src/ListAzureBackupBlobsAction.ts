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
 * Decodes the five predefined XML entities in one pass. A single pass (rather than one replace per
 * entity) is what keeps `&amp;lt;` decoding to the literal text `&lt;`, not to `<`.
 */
function decodeXml(str: string): string {
    const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    return str.replace(/&(amp|lt|gt|quot|apos);/g, (_match, name: string) => entities[name]);
}

/** The string without any trailing occurrences of `ch`, without a regular expression on caller input. */
function trimTrailing(str: string, ch: string): string {
    let end = str.length;
    while (end > 0 && str[end - 1] === ch) {
        end--;
    }
    return str.slice(0, end);
}

/**
 * The text of the first `<tag>...</tag>` element at or after `from`, and the offset just past it, or
 * undefined when the element is absent. Plain index arithmetic rather than a regular expression over
 * the response body: the body is remote input, and a pattern with an unbounded lazy match over it
 * has polynomial worst-case cost on a crafted payload.
 */
function readElement(xml: string, tag: string, from: number): { Text: string; End: number } | undefined {
    const open = `<${tag}>`;
    const close = `</${tag}>`;
    const start = xml.indexOf(open, from);
    if (start < 0) {
        return undefined;
    }
    const textStart = start + open.length;
    const end = xml.indexOf(close, textStart);
    if (end < 0) {
        return undefined;
    }
    return { Text: xml.slice(textStart, end), End: end + close.length };
}

/**
 * Parses the Azure Blob Storage List Blobs XML response into AzureBlobItem[].
 */
export function ParseAzureListBlobsXml(xml: string, containerUrl: string): { blobs: AzureBlobItem[]; nextMarker?: string } {
    const blobs: AzureBlobItem[] = [];
    const cleanBaseUrl = trimTrailing(containerUrl, '/');

    const marker = readElement(xml, 'NextMarker', 0)?.Text.trim();
    const nextMarker = marker && marker.length > 0 ? marker : undefined;

    let cursor = 0;
    for (;;) {
        const blob = readElement(xml, 'Blob', cursor);
        if (!blob) {
            break;
        }
        cursor = blob.End;
        const item = parseBlobElement(blob.Text, cleanBaseUrl);
        if (item) {
            blobs.push(item);
        }
    }

    return { blobs, nextMarker };
}

/** One `<Blob>` element's item, or undefined when it carries no name. */
function parseBlobElement(blobXml: string, cleanBaseUrl: string): AzureBlobItem | undefined {
    const nameText = readElement(blobXml, 'Name', 0)?.Text.trim();
    if (!nameText) {
        return undefined;
    }
    const name = decodeXml(nameText);

    const lengthText = readElement(blobXml, 'Content-Length', 0)?.Text.trim();
    const sizeBytes = lengthText ? parseInt(lengthText, 10) : 0;

    const modifiedText = readElement(blobXml, 'Last-Modified', 0)?.Text.trim();
    let lastModified = '';
    if (modifiedText) {
        const parsedDate = new Date(modifiedText);
        lastModified = isNaN(parsedDate.getTime()) ? modifiedText : parsedDate.toISOString();
    }

    const encodedPath = name.split('/').map(encodeURIComponent).join('/');
    return {
        Name: name,
        Url: `${cleanBaseUrl}/${encodedPath}`,
        SizeBytes: isNaN(sizeBytes) ? 0 : sizeBytes,
        LastModified: lastModified,
    };
}

/**
 * Action that queries an Azure Blob Storage container via the Azure Storage REST API
 * to list available backup blobs.
 *
 * Parameters (Input):
 *   - ContainerUrl (required): Azure Blob Storage container URL (e.g. https://storage.blob.core.windows.net/backups)
 *   - SasToken (optional): Shared Access Signature token for container access
 *   - StorageCredentialID (optional): MJ Credentials record ID storing the SAS token
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

            // A container that allows anonymous listing needs no token, so the token is optional — but a
            // token or credential the caller DID supply must resolve, or a wrong credential ID would
            // surface as a baffling Azure 403/404 instead of "credential not found".
            const credentialSupplied = this.getStringParam(params, 'SasToken') !== undefined
                || this.getStringParam(params, 'StorageCredentialID') !== undefined;
            const sasToken = credentialSupplied ? await this.resolveSasToken(params) : '';

            const prefix = this.getStringParam(params, 'Prefix');
            const cleanSas = sasToken.replace(/^\?/, '').trim();
            const cleanContainerUrl = trimTrailing(containerUrl, '/');

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
                const parseResult = ParseAzureListBlobsXml(responseXml, cleanContainerUrl);
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
