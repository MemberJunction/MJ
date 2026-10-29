import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseIntegrationAction, TrimTrailingChars } from './BaseIntegrationAction.js';
import { StorageContainerUrlProblem } from './BackupSourceGuard.js';

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
    const cleanBaseUrl = TrimTrailingChars(containerUrl, '/');

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


/** Pages followed at most for one listing (a safety cap). */
const MAX_LIST_PAGES = 50;

/** Characters of an upstream error body kept in the server log. */
const MAX_LOGGED_ERROR_BODY = 500;

/** One listing request: the validated container and how to authenticate and filter. */
interface BlobListingRequest {
    ContainerUrl: string;
    Sas: string;
    Prefix?: string;
}

/** A listing that failed upstream: the HTTP status the storage service answered with. */
class BlobListingHttpError extends Error {
    constructor(public readonly Status: number, statusText: string) {
        super(`Azure Storage API error (${Status}${statusText ? ` ${statusText}` : ''}).`);
        this.name = 'BlobListingHttpError';
    }
}

/**
 * Action that queries an Azure Blob Storage container via the Azure Storage REST API
 * to list available backup blobs.
 *
 * Parameters (Input):
 *   - ContainerUrl (required): Azure Blob Storage container URL (e.g. https://storage.blob.core.windows.net/backups).
 *     Only an https Azure Blob endpoint naming one container is fetched (`INVALID_PARAMETER` otherwise).
 *   - SasToken (optional): Shared Access Signature token for container access
 *   - StorageCredentialID (optional): MJ Credentials record ID storing the SAS token (the caller must be able to read it)
 *   - Prefix (optional): Optional prefix to filter blob names (e.g. "mydb_backup_")
 *
 * Parameters (Output):
 *   - Blobs: JSON-serialized array of { Name, Url, SizeBytes, LastModified }
 *   - BlobCount: Total number of blobs found
 *
 * An upstream error is reported by its HTTP status only; the response body is never returned.
 */
@RegisterClass(BaseAction, 'List Azure Backup Blobs')
export class ListAzureBackupBlobsAction extends BaseIntegrationAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const containerUrl = this.readContainerUrl(params);
            if (typeof containerUrl !== 'string') {
                return { Success: false, ResultCode: containerUrl.ResultCode, Message: containerUrl.Message, Params: params.Params };
            }
            const request: BlobListingRequest = {
                ContainerUrl: containerUrl,
                Sas: await this.resolveOptionalSas(params),
                Prefix: this.GetStringParam(params, 'Prefix'),
            };
            LogStatus(`[ListAzureBackupBlobsAction] Querying container '${containerUrl}' with prefix '${request.Prefix ?? ''}'...`);
            const blobs = await this.listAllBlobs(request);
            this.AddOutputParam(params, 'Blobs', JSON.stringify(blobs));
            this.AddOutputParam(params, 'BlobCount', blobs.length);
            return { Success: true, ResultCode: 'SUCCESS', Message: `Found ${blobs.length} blob(s) in container '${containerUrl}'.`, Params: params.Params };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`[ListAzureBackupBlobsAction] Listing failed: ${message}`);
            return { Success: false, ResultCode: 'LIST_BLOBS_FAILED', Message: message, Params: params.Params };
        }
    }

    /**
     * The container URL without a trailing slash, or the refusal of a missing or invalid one. Only an
     * https Azure Blob container is accepted, so the action never fetches another host (no SSRF).
     */
    private readContainerUrl(params: RunActionParams): string | { ResultCode: string; Message: string } {
        const raw = this.GetStringParam(params, 'ContainerUrl');
        if (!raw) {
            return { ResultCode: 'MISSING_PARAMETER', Message: "Parameter 'ContainerUrl' is required." };
        }
        const containerUrl = TrimTrailingChars(raw, '/');
        const problem = StorageContainerUrlProblem(containerUrl);
        return problem ? { ResultCode: 'INVALID_PARAMETER', Message: problem } : containerUrl;
    }

    /**
     * The SAS token, or '' for an anonymous listing. A container that allows anonymous listing needs no
     * token, so the token is optional — but a token or credential the caller DID supply must resolve, or a
     * wrong credential ID would surface as a baffling Azure 403/404 instead of "credential not found".
     */
    private async resolveOptionalSas(params: RunActionParams): Promise<string> {
        const credentialSupplied = this.GetStringParam(params, 'SasToken') !== undefined
            || this.GetStringParam(params, 'StorageCredentialID') !== undefined;
        const sasToken = credentialSupplied ? await this.ResolveSasToken(params) : '';
        return sasToken.replace(/^\?/, '').trim();
    }

    /** Every blob in the container, following `NextMarker` pagination up to {@link MAX_LIST_PAGES} pages. */
    private async listAllBlobs(request: BlobListingRequest): Promise<AzureBlobItem[]> {
        const allBlobs: AzureBlobItem[] = [];
        let marker: string | undefined = undefined;
        let pageCount = 0;
        do {
            pageCount++;
            const page = await this.fetchBlobPage(request, marker);
            allBlobs.push(...page.blobs);
            marker = page.nextMarker;
        } while (marker && pageCount < MAX_LIST_PAGES);
        return allBlobs;
    }

    /** One List Blobs page. A non-2xx answer throws {@link BlobListingHttpError}; its body is only logged. */
    private async fetchBlobPage(request: BlobListingRequest, marker: string | undefined): Promise<{ blobs: AzureBlobItem[]; nextMarker?: string }> {
        const response = await fetch(this.buildListUrl(request, marker), {
            method: 'GET',
            headers: { 'x-ms-version': '2021-08-06' },
        });
        if (!response.ok) {
            const errorText = await response.text();
            LogError(`[ListAzureBackupBlobsAction] Azure REST API error (${response.status} ${response.statusText}): ${errorText.slice(0, MAX_LOGGED_ERROR_BODY)}`);
            throw new BlobListingHttpError(response.status, response.statusText);
        }
        return ParseAzureListBlobsXml(await response.text(), request.ContainerUrl);
    }

    /** The List Blobs request URL for one page. */
    private buildListUrl(request: BlobListingRequest, marker: string | undefined): string {
        let apiUrl = `${request.ContainerUrl}?restype=container&comp=list`;
        if (request.Prefix) {
            apiUrl += `&prefix=${encodeURIComponent(request.Prefix)}`;
        }
        if (marker) {
            apiUrl += `&marker=${encodeURIComponent(marker)}`;
        }
        if (request.Sas) {
            apiUrl += `&${request.Sas}`;
        }
        return apiUrl;
    }
}
