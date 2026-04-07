/**
 * SharePointConnector — Integration connector for Microsoft SharePoint via the Microsoft Graph API.
 *
 * API Documentation:
 *   - Graph API: https://learn.microsoft.com/en-us/graph/api/resources/sharepoint?view=graph-rest-1.0
 *   - SPFx overview: https://learn.microsoft.com/en-us/sharepoint/dev/spfx/connect-to-sharepoint
 *
 * Auth: Azure AD OAuth 2.0 client_credentials flow.
 *       Token endpoint: https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
 *       Scope: https://graph.microsoft.com/.default
 *       Credentials: TenantID, ClientID, ClientSecret, SiteID stored in credential.Values.
 *
 * Base URL: https://graph.microsoft.com/v1.0/sites/{siteId}
 * Pagination: @odata.nextLink cursor + $top for page size
 * Rate limits: ~10,000 requests per 10 minutes per app (Graph API throttling)
 * Incremental: $filter on fields/Modified for list items
 * CRUD: Full on List Items, Lists; read-only on Sites, Document Libraries, Drive Items
 *
 * API Categories:
 *   - Sites API (implemented, read-only) — site metadata and search
 *   - Lists API (implemented) — SharePoint lists, CRUD on list items
 *   - Document Libraries / Drives API (implemented, read-only) — drive metadata, files, folders
 *   - Drive Items / Files API (implemented, read-only) — file metadata, no binary content sync
 *   - Pages API (NOT implemented) — site pages; beta endpoint, not stable for production sync
 *   - Permissions API (NOT implemented) — sharing/permission management; separate security concern
 *   - Webhooks / Subscriptions (available, not implemented) — Graph subscriptions for change notifications
 *   - Content Types API (NOT implemented) — schema-level metadata; not record-level data
 *   - Term Store API (NOT implemented) — managed metadata taxonomy; specialized use case
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalRecord,
    type DefaultFieldMapping,
    type FetchContext,
    type FetchBatchResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type CRUDResult,
    type IntegrationObjectInfo,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────────

export interface SharePointConnectionConfig {
    TenantID: string;
    ClientID: string;
    ClientSecret: string;
    SiteID: string;  // format: {hostname},{siteCollectionId},{siteId}
}

interface SPAuthContext extends RESTAuthContext {
    Config: SharePointConnectionConfig;
    SiteURL: string;
}

interface CachedToken {
    AccessToken: string;
    ExpiresAt: number;
}

interface GraphPagedResponse {
    value: Record<string, unknown>[];
    '@odata.nextLink'?: string;
    '@odata.count'?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SP_PAGE_SIZE = 200;
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 60; // ~10K/10min ≈ 16/sec, 60ms is safe

// ─── Static Object Definitions ────────────────────────────────────────────

const SP_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Site',
        DisplayName: 'Site',
        Description: 'SharePoint site metadata (singleton, read-only)',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'Site ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique site identifier' },
            { Name: 'displayName', DisplayName: 'Display Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Site display name' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Site name' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Site description' },
            { Name: 'webUrl', DisplayName: 'Web URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Full site URL' },
            { Name: 'createdDateTime', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Site creation date' },
            { Name: 'lastModifiedDateTime', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification date' },
        ],
    },
    {
        Name: 'Lists',
        DisplayName: 'List',
        Description: 'SharePoint lists on the site',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'List ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique list identifier' },
            { Name: 'displayName', DisplayName: 'Display Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'List display name' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Internal list name' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'List description' },
            { Name: 'webUrl', DisplayName: 'Web URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'List URL in SharePoint' },
            { Name: 'createdDateTime', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'List creation date' },
            { Name: 'lastModifiedDateTime', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification date' },
            { Name: 'list', DisplayName: 'List Info', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'List template and settings object' },
        ],
    },
    {
        Name: 'ListItems',
        DisplayName: 'List Item',
        Description: 'Items within SharePoint lists (parent-child under Lists). Includes expanded field values.',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'Item ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique list item identifier' },
            { Name: 'listId', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent list ID' },
            { Name: 'fields', DisplayName: 'Fields', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Custom column values object (expanded via ?expand=fields)' },
            { Name: 'contentType', DisplayName: 'Content Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Content type of this item' },
            { Name: 'webUrl', DisplayName: 'Web URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Item URL' },
            { Name: 'createdDateTime', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Item creation date' },
            { Name: 'lastModifiedDateTime', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification date' },
            { Name: 'createdBy', DisplayName: 'Created By', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'User who created the item' },
            { Name: 'lastModifiedBy', DisplayName: 'Modified By', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'User who last modified the item' },
        ],
    },
    {
        Name: 'Drives',
        DisplayName: 'Document Library',
        Description: 'Document libraries (OneDrive-style drives) on the site',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'Drive ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique drive identifier' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Drive name' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Drive description' },
            { Name: 'webUrl', DisplayName: 'Web URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Drive URL' },
            { Name: 'driveType', DisplayName: 'Drive Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Type (documentLibrary, personal, etc.)' },
            { Name: 'createdDateTime', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Drive creation date' },
            { Name: 'lastModifiedDateTime', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification date' },
            { Name: 'quota', DisplayName: 'Quota', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Storage quota info object' },
        ],
    },
    {
        Name: 'DriveItems',
        DisplayName: 'Drive Item (File/Folder)',
        Description: 'Files and folders within document libraries (parent-child under Drives). Metadata only — no binary content.',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'Item ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique drive item identifier' },
            { Name: 'driveId', DisplayName: 'Drive ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent drive ID' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'File or folder name' },
            { Name: 'size', DisplayName: 'Size', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'File size in bytes' },
            { Name: 'webUrl', DisplayName: 'Web URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Item URL' },
            { Name: 'mimeType', DisplayName: 'MIME Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'File MIME type (files only)' },
            { Name: 'folder', DisplayName: 'Folder', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Folder metadata (present if folder)' },
            { Name: 'file', DisplayName: 'File', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'File metadata (present if file)' },
            { Name: 'parentReference', DisplayName: 'Parent Reference', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent folder/drive reference' },
            { Name: 'createdDateTime', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation date' },
            { Name: 'lastModifiedDateTime', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification date' },
            { Name: 'createdBy', DisplayName: 'Created By', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'User who created the item' },
            { Name: 'lastModifiedBy', DisplayName: 'Modified By', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'User who last modified the item' },
        ],
    },
    {
        Name: 'Columns',
        DisplayName: 'Site Column',
        Description: 'Column definitions on the site (read-only schema metadata)',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'Column ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Column GUID' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Internal column name' },
            { Name: 'displayName', DisplayName: 'Display Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Column display name' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Column description' },
            { Name: 'columnGroup', DisplayName: 'Group', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Column group name' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Column data type' },
            { Name: 'readOnly', DisplayName: 'Read Only', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether column is read-only' },
            { Name: 'required', DisplayName: 'Required', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether column is required' },
        ],
    },
    // ─── Additional Graph/SharePoint endpoints — lean overlay ──
    { Name: 'ContentTypes', DisplayName: 'Content Type', Description: 'Site content type definitions', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Content type ID' },
    ]},
    { Name: 'Pages', DisplayName: 'Site Page', Description: 'SharePoint site pages', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Page ID' },
        { Name: 'lastModifiedDateTime', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Subsites', DisplayName: 'Subsite', Description: 'Child sites under this site', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Site ID' },
        { Name: 'lastModifiedDateTime', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'SitePermissions', DisplayName: 'Site Permission', Description: 'App-level site permissions', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Permission ID' },
    ]},
    { Name: 'DriveItemVersions', DisplayName: 'File Version', Description: 'File version history (child of DriveItems)', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Version ID' },
        { Name: 'driveItemId', DisplayName: 'Drive Item ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → DriveItems' },
        { Name: 'lastModifiedDateTime', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'DriveItemPermissions', DisplayName: 'File Permission', Description: 'Sharing permissions on files (child of DriveItems)', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Permission ID' },
        { Name: 'driveItemId', DisplayName: 'Drive Item ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → DriveItems' },
    ]},
    { Name: 'ListItemVersions', DisplayName: 'List Item Version', Description: 'Item version history (child of ListItems)', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Version ID' },
        { Name: 'listItemId', DisplayName: 'List Item ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → ListItems' },
    ]},
    { Name: 'TermStoreGroups', DisplayName: 'Term Store Group', Description: 'Managed metadata taxonomy groups', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Group ID' },
    ]},
    { Name: 'TermStoreSets', DisplayName: 'Term Set', Description: 'Term sets within taxonomy groups', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Term set ID' },
        { Name: 'groupId', DisplayName: 'Group ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → TermStoreGroups' },
    ]},
    { Name: 'RecycleBinItems', DisplayName: 'Recycle Bin Item', Description: 'Deleted items in recycle bin', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Recycle bin item ID' },
        { Name: 'deletedDateTime', DisplayName: 'Deleted', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    // ─── Remaining SharePoint/Graph sub-resources ──
    { Name: 'ContentTypeColumns', DisplayName: 'CT Column', Description: 'Field definitions on content types', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Column ID' },
        { Name: 'contentTypeId', DisplayName: 'CT ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → ContentTypes' },
    ]},
    { Name: 'PageWebParts', DisplayName: 'Page Web Part', Description: 'Web parts embedded in pages', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Web part ID' },
        { Name: 'pageId', DisplayName: 'Page ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Pages' },
    ]},
    { Name: 'ListContentTypes', DisplayName: 'List Content Type', Description: 'Content types scoped to a list', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Content type ID' },
        { Name: 'listId', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'ListItemActivities', DisplayName: 'Item Activity', Description: 'Activity feed on list items', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Activity ID' },
        { Name: 'listItemId', DisplayName: 'Item ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → ListItems' },
    ]},
    { Name: 'Terms', DisplayName: 'Term', Description: 'Individual taxonomy terms within term sets', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Term ID' },
        { Name: 'setId', DisplayName: 'Set ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → TermStoreSets' },
    ]},
    { Name: 'Subscriptions', DisplayName: 'Webhook Subscription', Description: 'Graph change notification subscriptions', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Subscription ID' },
        { Name: 'expirationDateTime', DisplayName: 'Expires', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Subscription expiry' },
    ]},
    { Name: 'SiteOperations', DisplayName: 'Site Operation', Description: 'Long-running operation status', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Operation ID' },
        { Name: 'createdDateTime', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'ListItemActivities2', DisplayName: 'Item Activity', Description: 'Activity feed on list items', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Activity ID' },
    ]},
];

// ─── Connector ────────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'SharePointConnector')
export class SharePointConnector extends BaseRESTIntegrationConnector {
    private tokenCache: CachedToken | null = null;
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'SharePoint'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return SP_OBJECTS;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-brands fa-microsoft';
        config.CategoryDescription = 'SharePoint document libraries, lists, and list items via Microsoft Graph API';
        config.ParentCategoryName = 'Collaboration';
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    // ─── Discovery ─────────────────────────────────────────────────────

    public override async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity, _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return SP_OBJECTS.map(obj => ({
            Name: obj.Name,
            Label: obj.DisplayName,
            Description: obj.Description,
            SupportsIncrementalSync: ['ListItems', 'DriveItems'].includes(obj.Name),
            SupportsWrite: obj.SupportsWrite ?? false,
        }));
    }

    public override async DiscoverFields(
        _companyIntegration: MJCompanyIntegrationEntity, objectName: string, _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const staticObj = SP_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!staticObj) return [];
        return staticObj.Fields.map(f => ({
            Name: f.Name,
            Label: f.DisplayName,
            Description: f.Description,
            DataType: f.Type,
            IsRequired: f.IsRequired,
            IsUniqueKey: f.IsPrimaryKey,
            IsReadOnly: f.IsReadOnly,
        }));
    }

    // ─── Auth ──────────────────────────────────────────────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(companyIntegration, contextUser);

        if (this.tokenCache && this.tokenCache.ExpiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
            return this.BuildAuthCtx(this.tokenCache.AccessToken, config);
        }

        const token = await this.ObtainToken(config);
        this.tokenCache = token;
        return this.BuildAuthCtx(token.AccessToken, config);
    }

    private BuildAuthCtx(accessToken: string, config: SharePointConnectionConfig): SPAuthContext {
        return {
            Token: accessToken,
            TokenType: 'Bearer',
            Config: config,
            SiteURL: `${GRAPH_BASE}/sites/${config.SiteID}`,
        };
    }

    private async ObtainToken(config: SharePointConnectionConfig): Promise<CachedToken> {
        const tokenURL = `https://login.microsoftonline.com/${config.TenantID}/oauth2/v2.0/token`;
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: config.ClientID,
            client_secret: config.ClientSecret,
            scope: 'https://graph.microsoft.com/.default',
        });

        const response = await fetch(tokenURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
            throw new Error(`SharePoint token request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { access_token: string; expires_in: number };
        return {
            AccessToken: data.access_token,
            ExpiresAt: Date.now() + ((data.expires_in ?? 3600) * 1000),
        };
    }

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity, contextUser?: UserInfo
    ): Promise<SharePointConnectionConfig> {
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const md = new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (loaded && credential.Values) {
                const parsed = JSON.parse(credential.Values) as Record<string, string>;
                if (parsed['TenantID'] && parsed['ClientID'] && parsed['SiteID']) {
                    return {
                        TenantID: parsed['TenantID'],
                        ClientID: parsed['ClientID'],
                        ClientSecret: parsed['ClientSecret'] ?? '',
                        SiteID: parsed['SiteID'],
                    };
                }
            }
        }
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Record<string, string>;
            return {
                TenantID: parsed['TenantID'] ?? '',
                ClientID: parsed['ClientID'] ?? '',
                ClientSecret: parsed['ClientSecret'] ?? '',
                SiteID: parsed['SiteID'] ?? '',
            };
        }
        throw new Error(
            'No SharePoint credentials found. Set TenantID, ClientID, ClientSecret, SiteID in credential Values or Configuration JSON.'
        );
    }

    // ─── TestConnection ────────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as SPAuthContext;
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, auth.SiteURL, 'GET', headers);
            if (response.Status === 200) {
                const body = response.Body as Record<string, unknown>;
                return { Success: true, Message: `Connected to SharePoint: ${body['displayName'] ?? 'Unknown site'}` };
            }
            return { Success: false, Message: `Graph API returned ${response.Status}` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ─── URL Building ──────────────────────────────────────────────────

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as SPAuthContext).SiteURL;
    }

    protected override BuildPaginatedURL(
        basePath: string, _obj: { PaginationType: string; DefaultPageSize: number },
        _page: number, _offset: number, cursor?: string
    ): string {
        if (cursor) return cursor; // @odata.nextLink is a full URL
        const sep = basePath.includes('?') ? '&' : '?';
        return `${basePath}${sep}$top=${SP_PAGE_SIZE}`;
    }

    // ─── Response Parsing ──────────────────────────────────────────────

    protected NormalizeResponse(rawBody: unknown, _responseDataKey: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        const body = rawBody as Record<string, unknown>;
        if (Array.isArray(body['value'])) return body['value'] as Record<string, unknown>[];
        if (body && Object.keys(body).length > 0) return [body];
        return [];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown, _paginationType: PaginationType, _currentPage: number, _currentOffset: number, _pageSize: number
    ): PaginationState {
        const body = rawBody as GraphPagedResponse;
        const nextLink = body['@odata.nextLink'] as string | undefined;
        return {
            HasMore: !!nextLink,
            NextCursor: nextLink,
        };
    }

    // ─── FetchChanges ──────────────────────────────────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const objectLower = ctx.ObjectName.toLowerCase();

        switch (objectLower) {
            case 'site':       return this.FetchSite(ctx);
            case 'lists':      return this.FetchLists(ctx);
            case 'listitems':  return this.FetchListItems(ctx);
            case 'drives':     return this.FetchDrives(ctx);
            case 'driveitems': return this.FetchDriveItems(ctx);
            case 'columns':    return this.FetchColumns(ctx);
            default:           return this.FetchGenericSPObject(ctx);
        }
    }

    private async FetchGenericSPObject(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as SPAuthContext;
        const headers = this.BuildHeaders(auth);
        const apiPath = ctx.ObjectName.replace(/([a-z])([A-Z])/g, '$1/$2').toLowerCase();
        const url = ctx.CurrentCursor ?? `${auth.SiteURL}/${apiPath}?$top=${SP_PAGE_SIZE}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`SharePoint ${ctx.ObjectName} API error: ${response.Status}`);
        }
        const body = response.Body as GraphPagedResponse;
        const records = body.value ?? [];
        const nextLink = body['@odata.nextLink'];
        return {
            Records: records.map(r => ({ ExternalID: String(r['id'] ?? ''), ObjectType: ctx.ObjectName, Fields: r })),
            HasMore: !!nextLink, NextCursor: nextLink,
        };
    }

    private async FetchSite(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as SPAuthContext;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, auth.SiteURL, 'GET', headers);
        if (response.Status !== 200) throw new Error(`SharePoint site API error: ${response.Status}`);
        const body = response.Body as Record<string, unknown>;
        return {
            Records: [{ ExternalID: String(body['id'] ?? ''), ObjectType: 'Site', Fields: body }],
            HasMore: false,
        };
    }

    private async FetchLists(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as SPAuthContext;
        const headers = this.BuildHeaders(auth);
        const url = ctx.CurrentCursor ?? `${auth.SiteURL}/lists?$top=${SP_PAGE_SIZE}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) throw new Error(`SharePoint lists API error: ${response.Status}`);

        const body = response.Body as GraphPagedResponse;
        const records = body.value ?? [];
        const nextLink = body['@odata.nextLink'];

        return {
            Records: records.map(r => ({ ExternalID: String(r['id'] ?? ''), ObjectType: 'Lists', Fields: r })),
            HasMore: !!nextLink,
            NextCursor: nextLink,
        };
    }

    private async FetchListItems(ctx: FetchContext): Promise<FetchBatchResult> {
        // Parent-child: ListItems belong to a specific List.
        // We iterate all lists and collect items, or use a specific listId from context if provided.
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as SPAuthContext;
        const headers = this.BuildHeaders(auth);

        // First, get all list IDs
        const listIDs = await this.FetchAllListIDs(auth, headers);
        const allItems: ExternalRecord[] = [];
        let latestModified: string | undefined;

        for (const listId of listIDs) {
            let url = `${auth.SiteURL}/lists/${listId}/items?$expand=fields&$top=${SP_PAGE_SIZE}`;
            if (ctx.WatermarkValue) {
                url += `&$filter=fields/Modified gt '${ctx.WatermarkValue}'`;
            }

            while (url) {
                const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
                if (response.Status < 200 || response.Status >= 300) break;

                const body = response.Body as GraphPagedResponse;
                for (const item of (body.value ?? [])) {
                    allItems.push({
                        ExternalID: String(item['id'] ?? ''),
                        ObjectType: 'ListItems',
                        Fields: { ...item, listId },
                    });
                    const modified = item['lastModifiedDateTime'] as string | undefined;
                    if (modified && (!latestModified || modified > latestModified)) latestModified = modified;
                }

                url = body['@odata.nextLink'] ?? '';
            }
        }

        return {
            Records: allItems,
            HasMore: false,
            NewWatermarkValue: latestModified,
        };
    }

    private async FetchAllListIDs(auth: SPAuthContext, headers: Record<string, string>): Promise<string[]> {
        const ids: string[] = [];
        let url: string | undefined = `${auth.SiteURL}/lists?$top=200&$select=id`;

        while (url) {
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status < 200 || response.Status >= 300) break;
            const body = response.Body as GraphPagedResponse;
            for (const list of (body.value ?? [])) ids.push(String(list['id'] ?? ''));
            url = body['@odata.nextLink'];
        }

        return ids;
    }

    private async FetchDrives(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as SPAuthContext;
        const headers = this.BuildHeaders(auth);
        const url = ctx.CurrentCursor ?? `${auth.SiteURL}/drives?$top=${SP_PAGE_SIZE}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) throw new Error(`SharePoint drives API error: ${response.Status}`);

        const body = response.Body as GraphPagedResponse;
        const records = body.value ?? [];
        const nextLink = body['@odata.nextLink'];

        return {
            Records: records.map(r => ({ ExternalID: String(r['id'] ?? ''), ObjectType: 'Drives', Fields: r })),
            HasMore: !!nextLink,
            NextCursor: nextLink,
        };
    }

    private async FetchDriveItems(ctx: FetchContext): Promise<FetchBatchResult> {
        // Fetch all drives, then get root children for each
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as SPAuthContext;
        const headers = this.BuildHeaders(auth);

        const driveIDs = await this.FetchAllDriveIDs(auth, headers);
        const allItems: ExternalRecord[] = [];

        for (const driveId of driveIDs) {
            let url: string | undefined = `${auth.SiteURL}/drives/${driveId}/root/children?$top=${SP_PAGE_SIZE}`;

            while (url) {
                const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
                if (response.Status < 200 || response.Status >= 300) break;
                const body = response.Body as GraphPagedResponse;
                for (const item of (body.value ?? [])) {
                    allItems.push({
                        ExternalID: String(item['id'] ?? ''),
                        ObjectType: 'DriveItems',
                        Fields: { ...item, driveId },
                    });
                }
                url = body['@odata.nextLink'];
            }
        }

        return { Records: allItems, HasMore: false };
    }

    private async FetchAllDriveIDs(auth: SPAuthContext, headers: Record<string, string>): Promise<string[]> {
        const url = `${auth.SiteURL}/drives?$top=200&$select=id`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) return [];
        const body = response.Body as GraphPagedResponse;
        return (body.value ?? []).map(d => String(d['id'] ?? ''));
    }

    private async FetchColumns(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as SPAuthContext;
        const headers = this.BuildHeaders(auth);
        const url = ctx.CurrentCursor ?? `${auth.SiteURL}/columns?$top=${SP_PAGE_SIZE}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) return { Records: [], HasMore: false };

        const body = response.Body as GraphPagedResponse;
        const records = body.value ?? [];
        const nextLink = body['@odata.nextLink'];

        return {
            Records: records.map(r => ({ ExternalID: String(r['id'] ?? ''), ObjectType: 'Columns', Fields: r })),
            HasMore: !!nextLink,
            NextCursor: nextLink,
        };
    }

    // ─── CRUD ──────────────────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as SPAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = this.CRUDEndpointURL(auth, ctx.ObjectName, ctx.Attributes, null);
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            const body = response.Body as Record<string, unknown>;
            return { Success: true, ExternalID: String(body['id'] ?? ''), StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as SPAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = this.CRUDEndpointURL(auth, ctx.ObjectName, ctx.Attributes, ctx.ExternalID);
        const response = await this.MakeHTTPRequest(auth, url, 'PATCH', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'UpdateRecord', ctx.ObjectName);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as SPAuthContext;
        const headers = this.BuildHeaders(auth);
        const url = this.CRUDEndpointURL(auth, ctx.ObjectName, {}, ctx.ExternalID);
        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', headers);
        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'DeleteRecord', ctx.ObjectName);
    }

    private CRUDEndpointURL(
        auth: SPAuthContext, objectName: string, attrs: Record<string, unknown>, externalID: string | null
    ): string {
        const lower = objectName.toLowerCase();

        if (lower === 'lists') {
            const base = `${auth.SiteURL}/lists`;
            return externalID ? `${base}/${externalID}` : base;
        }

        if (lower === 'listitems') {
            const listId = attrs['listId'] as string ?? '';
            const base = `${auth.SiteURL}/lists/${listId}/items`;
            if (externalID) return `${base}/${externalID}`;
            // For create, Graph expects { fields: { ...column values } }
            return base;
        }

        return `${auth.SiteURL}/${lower}${externalID ? `/${externalID}` : ''}`;
    }

    private BuildCRUDError(response: RESTResponse, operation: string, objectName: string): CRUDResult {
        const bodyStr = typeof response.Body === 'string' ? response.Body : JSON.stringify(response.Body);
        return {
            Success: false,
            ExternalID: '',
            StatusCode: response.Status,
            ErrorMessage: `${operation} failed for ${objectName}: HTTP ${response.Status} — ${bodyStr?.substring(0, 300)}`,
        };
    }

    // ─── Headers ───────────────────────────────────────────────────────

    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${auth.Token}`,
            'Accept': 'application/json',
            'User-Agent': 'MemberJunction-Integration/1.0',
        };
    }

    // ─── HTTP Transport ────────────────────────────────────────────────

    protected async MakeHTTPRequest(
        _auth: RESTAuthContext, url: string, method: string,
        headers: Record<string, string>, body?: unknown
    ): Promise<RESTResponse> {
        await this.Throttle();

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.FetchWithTimeout(url, method, headers, body);
            this.lastRequestTime = Date.now();

            if (response.status === 401 && attempt === 0) {
                this.tokenCache = null;
                console.warn('[SharePoint] 401 — clearing token cache for retry');
                continue;
            }

            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') ?? '10', 10);
                const delay = Math.min(retryAfter * 1000, 120_000);
                console.warn(`[SharePoint] Throttled (429), waiting ${delay}ms`);
                await this.Sleep(delay);
                continue;
            }

            if (response.status >= 500 && attempt < MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
                console.warn(`[SharePoint] Server error ${response.status}, retrying in ${delay}ms`);
                await this.Sleep(delay);
                continue;
            }

            const responseBody = await this.ParseBody(response);
            return this.ToRESTResponse(response, responseBody);
        }

        throw new Error(`SharePoint request failed after ${MAX_RETRIES} retries: ${url}`);
    }

    private async FetchWithTimeout(
        url: string, method: string, headers: Record<string, string>, body?: unknown
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const opts: RequestInit = { method, headers, signal: controller.signal };
            if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                opts.body = JSON.stringify(body);
            }
            return await fetch(url, opts);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`SharePoint request timed out: ${url}`);
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async ParseBody(response: Response): Promise<unknown> {
        const ct = response.headers.get('content-type') ?? '';
        if (ct.includes('json')) return response.json() as Promise<unknown>;
        return response.text();
    }

    private ToRESTResponse(response: Response, body: unknown): RESTResponse {
        const hdrs: Record<string, string> = {};
        response.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
        return { Status: response.status, Body: body, Headers: hdrs };
    }

    private async Throttle(): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < MIN_REQUEST_INTERVAL_MS) await this.Sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Default Field Mappings ────────────────────────────────────────

    public override GetDefaultFieldMappings(objectName: string): DefaultFieldMapping[] {
        const obj = SP_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({
            SourceFieldName: f.Name,
            DestinationFieldName: f.Name,
            IsKeyField: f.IsPrimaryKey,
        }));
    }
}

// Tree-shaking prevention — REQUIRED
export function LoadSharePointConnector() { /* intentionally empty */ }
