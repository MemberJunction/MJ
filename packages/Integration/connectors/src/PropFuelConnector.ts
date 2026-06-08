import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
    type SourceSchemaInfo,
    type SourceFieldInfo,
    type SourceRelationshipInfo,
    type IntrospectSchemaOptions,
} from '@memberjunction/integration-engine';
import { z } from 'zod';

// ─── Connection config ──────────────────────────────────────────────────

/**
 * Connection configuration for the PropFuel (re:Members) file-feed connector.
 *
 * PropFuel integrates via a scheduled JSON data-export FILE FEED — not a per-object
 * REST CRUD API. Two credential fields are required:
 *  - `Token`     — bearer token sent on every request as `Authorization: Bearer <token>`.
 *  - `AccountID` — numeric tenant id embedded in every URL path (e.g. `2019`).
 */
export interface PropFuelConnectionConfig {
    /** Bearer token for the Authorization header. */
    Token: string;
    /** Numeric account/tenant id embedded in the dataexport URL paths. */
    AccountID: string;
    /** Optional override of the base host. Defaults to https://app.propfuel.com */
    BaseURL?: string;
    /** Max retries for retryable transport failures. Default: 3 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000 */
    RequestTimeoutMs?: number;
}

/** Zod schema for the parsed credential / configuration shape. */
const PropFuelConnectionConfigSchema = z.object({
    Token: z.string().min(1, 'PropFuelConnector: Token is required'),
    AccountID: z.union([z.string(), z.number()]).transform(v => String(v)),
    BaseURL: z.string().optional(),
    MaxRetries: z.number().optional(),
    RequestTimeoutMs: z.number().optional(),
});

/** Auth context carrying the parsed PropFuel config. */
interface PropFuelAuthContext extends RESTAuthContext {
    Config: PropFuelConnectionConfig;
}

// ─── Constants ──────────────────────────────────────────────────────────

const PROPFUEL_DEFAULT_BASE_URL = 'https://app.propfuel.com';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** The three proven data streams, keyed by lowercase IntegrationObject name. */
const PROPFUEL_STREAMS = ['checkin_questions', 'clicks', 'opens'] as const;
type PropFuelStream = (typeof PROPFUEL_STREAMS)[number];

/**
 * Maps an IntegrationObject (stream) name to the `[data type]` token that appears
 * in its export filenames: `[microtime]-[datatype].json`. Confirmed from live broker
 * results: `…-checkin_questions.json`, `…-clicks.json`, `…-opens.json`.
 */
const STREAM_FILENAME_TOKEN: Record<PropFuelStream, string> = {
    checkin_questions: 'checkin_questions',
    clicks: 'clicks',
    opens: 'opens',
};

/**
 * Per-stream flattening descriptor. The download files contain records with NESTED
 * objects; the connector flattens them into the exact IOF column names the frozen
 * contract declares. checkin_questions uses DOTTED names (`checkin_question.id`),
 * while clicks/opens use UNDERSCORE-prefixed names (`click_id`, `open_id`, `contact_id`).
 *
 * Each entry maps a nested source-object key in the raw record to the column-name PREFIX
 * + separator used when flattening that object's fields. The record's leading object
 * (the stream's own record object) is listed first.
 */
interface FlattenRule {
    /** Key of the nested object in the raw download record (e.g. 'checkin_question', 'contact'). */
    SourceKey: string;
    /** Prefix applied to each leaf field name when flattening this object. */
    Prefix: string;
    /** Separator between prefix and leaf field name ('.' for dotted, '_' for underscore). */
    Separator: string;
}

const STREAM_FLATTEN_RULES: Record<PropFuelStream, FlattenRule[]> = {
    // Dotted names: checkin_question.id, contact.id, question.id, campaign.id
    checkin_questions: [
        { SourceKey: 'checkin_question', Prefix: 'checkin_question', Separator: '.' },
        { SourceKey: 'contact', Prefix: 'contact', Separator: '.' },
        { SourceKey: 'question', Prefix: 'question', Separator: '.' },
        { SourceKey: 'campaign', Prefix: 'campaign', Separator: '.' },
    ],
    // Underscore names: click_id, contact_id, campaign_id, checkin_notification_id
    clicks: [
        { SourceKey: 'click', Prefix: 'click', Separator: '_' },
        { SourceKey: 'contact', Prefix: 'contact', Separator: '_' },
        { SourceKey: 'campaign', Prefix: 'campaign', Separator: '_' },
        { SourceKey: 'checkin_notification', Prefix: 'checkin_notification', Separator: '_' },
    ],
    // Underscore names: open_id, contact_id, campaign_id, checkin_notification_id
    opens: [
        { SourceKey: 'open', Prefix: 'open', Separator: '_' },
        { SourceKey: 'contact', Prefix: 'contact', Separator: '_' },
        { SourceKey: 'campaign', Prefix: 'campaign', Separator: '_' },
        { SourceKey: 'checkin_notification', Prefix: 'checkin_notification', Separator: '_' },
    ],
};

/** The PK column name (post-flatten) for each stream. */
const STREAM_PK_COLUMN: Record<PropFuelStream, string> = {
    checkin_questions: 'checkin_question.id',
    clicks: 'click_id',
    opens: 'open_id',
};

/**
 * Soft-delete tombstone column (post-flatten) per stream. Only checkin_questions is
 * mutable with soft-delete; clicks/opens are insert-only event streams (no tombstone).
 */
const STREAM_TOMBSTONE_COLUMN: Partial<Record<PropFuelStream, string>> = {
    checkin_questions: 'checkin_question.deleted_at',
};

/** Field schema for action/static discovery — surfaces EVERY proven column per stream. */
interface PropFuelStaticField {
    Name: string;
    Type: string;
    IsPrimaryKey: boolean;
    IsRequired: boolean;
    Description?: string;
}

/**
 * Static per-stream field catalog — mirrors the frozen contract's PerStreamSchema so
 * discovery works before the integration metadata is seeded into the DB. Every proven
 * field is surfaced (bounded typing is applied downstream by the schema builder; here
 * we report a generous source type so columns are sized comfortably, never MAX-stingy).
 */
const PROPFUEL_FIELDS: Record<PropFuelStream, PropFuelStaticField[]> = {
    checkin_questions: [
        { Name: 'checkin_question.id', Type: 'Integer', IsPrimaryKey: true, IsRequired: true, Description: 'Primary key of the check-in question record (live-proven identity field).' },
        { Name: 'checkin_question.checkin_id', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'Identifier of the parent check-in.' },
        { Name: 'checkin_question.rating', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'Numeric rating supplied when answering. Null until answered.' },
        { Name: 'checkin_question.selection', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'Selected choice value. Null until answered.' },
        { Name: 'checkin_question.response', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'Free-text response. Null until answered.' },
        { Name: 'checkin_question.answered_at', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'Timestamp the contact answered (update signal).' },
        { Name: 'checkin_question.created_at', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'Timestamp the record was created.' },
        { Name: 'checkin_question.updated_at', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'Timestamp of last update (record-level incremental watermark field).' },
        { Name: 'checkin_question.deleted_at', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'Soft-delete tombstone timestamp. Non-null => deleted.' },
        { Name: 'contact.id', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'Identifier of the contact.' },
        { Name: 'contact.name', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'Display name of the contact.' },
        { Name: 'contact.email', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'Email address of the contact.' },
        { Name: 'contact.external_ids', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'External identifier mapping (observed only null; type unknown).' },
        { Name: 'question.id', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'Identifier of the underlying question definition.' },
        { Name: 'question.display', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'Display text of the question.' },
        { Name: 'question.follow_up', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'Follow-up prompt text (observed only null; type unknown).' },
        { Name: 'question.response_type', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'Response type of the question.' },
        { Name: 'campaign.id', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'Identifier of the campaign.' },
        { Name: 'campaign.name', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'Name of the campaign.' },
    ],
    clicks: [
        { Name: 'click_id', Type: 'Integer', IsPrimaryKey: true, IsRequired: true, Description: 'click.id — primary key of the click event.' },
        { Name: 'click_type', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'click.type' },
        { Name: 'click_checkin_id', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'click.checkin_id' },
        { Name: 'click_clicked_at', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'click.clicked_at' },
        { Name: 'click_link', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'click.link' },
        { Name: 'contact_id', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'contact.id' },
        { Name: 'contact_name', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'contact.name' },
        { Name: 'contact_email', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'contact.email' },
        { Name: 'campaign_id', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'campaign.id' },
        { Name: 'campaign_name', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'campaign.name' },
        { Name: 'checkin_notification_id', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'checkin_notification.id' },
        { Name: 'checkin_notification_type', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'checkin_notification.type' },
    ],
    opens: [
        { Name: 'open_id', Type: 'Integer', IsPrimaryKey: true, IsRequired: true, Description: 'open.id — primary key of the open event.' },
        { Name: 'open_type', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'open.type' },
        { Name: 'open_checkin_id', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'open.checkin_id' },
        { Name: 'open_opened_at', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'open.opened_at' },
        { Name: 'contact_id', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'contact.id' },
        { Name: 'contact_name', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'contact.name' },
        { Name: 'contact_email', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'contact.email' },
        { Name: 'campaign_id', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'campaign.id' },
        { Name: 'campaign_name', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'campaign.name' },
        { Name: 'checkin_notification_id', Type: 'Integer', IsPrimaryKey: false, IsRequired: false, Description: 'checkin_notification.id' },
        { Name: 'checkin_notification_type', Type: 'String', IsPrimaryKey: false, IsRequired: false, Description: 'checkin_notification.type' },
    ],
};

/** Result of parsing a list-endpoint filename into its microtime cursor + datatype token. */
interface ParsedFeedFile {
    /** The raw filename as returned by the list endpoint. */
    FileName: string;
    /** The leading microtime prefix (Unix seconds with sub-second precision, e.g. "1777565710.1224"). */
    Microtime: string;
    /** The numeric microtime value, for ordering / watermark comparison. */
    MicrotimeValue: number;
    /** The `[data type]` segment of the filename. */
    DataType: string;
}

// ─── Connector ──────────────────────────────────────────────────────────

/**
 * Connector for the PropFuel (re:Members) member-engagement platform.
 *
 * PropFuel integrates via a scheduled JSON **data-export file feed**, NOT a per-object
 * REST CRUD API. A PropFuel-side job emits `.json` export files (~hourly); the connector
 * lists, downloads, and imports them. One IntegrationObject per proven data stream:
 *  - `checkin_questions` — mutable Q&A records; upsert-by-identity with soft-delete tombstones.
 *  - `clicks`            — insert-only link-click event stream.
 *  - `opens`             — insert-only email/message open event stream.
 *
 * It extends BaseRESTIntegrationConnector for the HTTP + Bearer-auth + JSON transport, but
 * OVERRIDES discovery and FetchChanges for FILE-FEED semantics (there is no record-level GET
 * by id, no per-object list path — the data arrives as whole files).
 *
 * Watermark/cursor: the leading `[microtime]` filename prefix. Files are processed oldest →
 * newest; the highest fully-downloaded file's microtime is the durable cursor, persisted by the
 * engine from FetchBatchResult.NewWatermarkValue. A partial-batch failure (a download error)
 * throws out of FetchChanges, so the engine never advances the watermark and the next run
 * resumes from the same point.
 *
 * WRITE POSTURE: PULL-ONLY. SupportsWrite=false and SupportsCreate/Update/Delete=false. The
 * `ack` endpoint (POST /dataexport/{AccountID}/ack/{file}) is the production CURSOR-ADVANCE
 * (consumes a processed file from the queue) — it is NOT record CRUD and NOT a write capability.
 * It is exposed via AcknowledgeFile and called ONLY on the real sync queue-advance path; it is
 * NEVER called from FetchChanges or from any test (tests are read-only: list + download only).
 */
@RegisterClass(BaseIntegrationConnector, 'PropFuelConnector')
export class PropFuelConnector extends BaseRESTIntegrationConnector {

    /** Timestamp of the last HTTP request — reserved for throttling hooks. */
    private lastRequestTime = 0;

    // ── Identity + capability surface (PULL-ONLY) ──────────────────────

    public override get IntegrationName(): string { return 'PropFuel'; }

    // No record-level write API exists. ack is a feed cursor-advance, not record CRUD.
    public override get SupportsCreate(): boolean { return false; }
    public override get SupportsUpdate(): boolean { return false; }
    public override get SupportsDelete(): boolean { return false; }
    public override get SupportsSearch(): boolean { return false; }
    public override get SupportsListing(): boolean { return false; }

    /**
     * Keyset/no-watermark resume hint. clicks/opens are insert-only event streams with no
     * per-record modified column; their stable ordering key is the integer PK, which the engine
     * can use for seek-resume. checkin_questions carries a real record-level watermark
     * (updated_at), so it returns null here (watermark-incremental, not keyset).
     */
    public override StableOrderingKey(objectName: string): string | null {
        const stream = this.normalizeStream(objectName);
        if (stream === 'clicks') return 'click_id';
        if (stream === 'opens') return 'open_id';
        return null;
    }

    // ── Discovery (file-feed: static per-stream catalog) ───────────────

    /**
     * Returns the three proven data streams. Overrides the base cache-driven discovery so the
     * connector is usable before the integration metadata is seeded into the DB.
     */
    public override async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return PROPFUEL_STREAMS.map(stream => ({
            Name: stream,
            Label: this.streamLabel(stream),
            Description: this.streamDescription(stream),
            // Only checkin_questions has a record-level incremental watermark (updated_at).
            SupportsIncrementalSync: stream === 'checkin_questions',
            SupportsWrite: false,
        }));
    }

    /**
     * Returns the proven field catalog for the named stream. Every proven column is surfaced.
     */
    public override async DiscoverFields(
        _companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const stream = this.normalizeStream(objectName);
        if (!stream) return [];
        return PROPFUEL_FIELDS[stream].map(f => ({
            Name: f.Name,
            Label: f.Name,
            Description: f.Description,
            DataType: f.Type,
            IsRequired: f.IsRequired,
            IsPrimaryKey: f.IsPrimaryKey,
            IsUniqueKey: f.IsPrimaryKey,
            IsReadOnly: true,
            IsForeignKey: false,
            ForeignKeyTarget: null,
        }));
    }

    /**
     * Builds the source-schema introspection result from the static catalog, additionally
     * surfacing each stream's IncrementalWatermarkField (the base IntrospectSchema does not).
     * Only checkin_questions has a record-level watermark; clicks/opens have none (file-level
     * microtime cursor only).
     */
    public override async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        options?: IntrospectSchemaOptions
    ): Promise<SourceSchemaInfo> {
        const wanted = options?.ObjectNames && options.ObjectNames.length > 0
            ? new Set(options.ObjectNames.map(n => n.toLowerCase()))
            : null;
        const streams = PROPFUEL_STREAMS.filter(s => !wanted || wanted.has(s));

        const result: SourceSchemaInfo = { Objects: [] };
        for (const stream of streams) {
            const fields = await this.DiscoverFields(companyIntegration, stream, contextUser);
            const sourceFields: SourceFieldInfo[] = fields.map(f => ({
                Name: f.Name,
                Label: f.Label,
                Description: f.Description,
                SourceType: f.DataType,
                IsRequired: f.IsRequired,
                AllowsNull: f.AllowsNull,
                MaxLength: f.MaxLength ?? null,
                Precision: f.Precision ?? null,
                Scale: f.Scale ?? null,
                DefaultValue: f.DefaultValue ?? null,
                IsPrimaryKey: f.IsPrimaryKey ?? false,
                IsUniqueKey: f.IsUniqueKey,
                IsReadOnly: f.IsReadOnly,
                IsForeignKey: f.IsForeignKey ?? false,
                ForeignKeyTarget: f.ForeignKeyTarget ?? null,
            }));
            const relationships: SourceRelationshipInfo[] = [];
            result.Objects.push({
                ExternalName: stream,
                ExternalLabel: this.streamLabel(stream),
                Description: this.streamDescription(stream),
                Fields: sourceFields,
                PrimaryKeyFields: sourceFields.filter(f => f.IsPrimaryKey).map(f => f.Name),
                Relationships: relationships,
                IncrementalWatermarkField: stream === 'checkin_questions' ? 'checkin_question.updated_at' : undefined,
            });
        }
        return result;
    }

    // ── FetchChanges (file-feed pull) ──────────────────────────────────

    /**
     * File-feed pull: list → filter by this stream's datatype → sort oldest→newest by the leading
     * microtime → download each file after the watermark → flatten + emit records.
     *
     * The microtime filename prefix is the cursor. NewWatermarkValue is the highest microtime of a
     * FULLY-downloaded file; if a download fails mid-iteration the method throws, the engine catches
     * it and never advances the watermark, so the next run resumes from the same point.
     *
     * NEVER calls ack — that is the production cursor-advance on the queue, exercised only by the
     * real sync queue-advance path (AcknowledgeFile), never during fetch or tests.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const stream = this.normalizeStream(ctx.ObjectName);
        if (!stream) {
            return {
                Records: [],
                HasMore: false,
                Warnings: [{ Code: 'UNKNOWN_STREAM', Message: `No PropFuel stream mapped for object "${ctx.ObjectName}"` }],
            };
        }

        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as PropFuelAuthContext;
        const allFiles = await this.listFiles(auth);
        const filesForStream = this.selectFilesForStream(allFiles, stream, ctx.WatermarkValue);

        if (filesForStream.length === 0) {
            return { Records: [], HasMore: false };
        }

        const records: ExternalRecord[] = [];
        let highestProcessedMicrotime: string | null = null;

        // Oldest → newest. A download failure throws BEFORE advancing highestProcessedMicrotime,
        // leaving the watermark unchanged for the whole batch (partial-failure safety).
        for (const file of filesForStream) {
            const rawRecords = await this.downloadFile(auth, file.FileName);
            for (const raw of rawRecords) {
                records.push(this.buildExternalRecord(raw, stream));
            }
            highestProcessedMicrotime = file.Microtime;
        }

        return {
            Records: records,
            HasMore: false,
            NewWatermarkValue: highestProcessedMicrotime ?? undefined,
        };
    }

    /**
     * Acknowledges a processed file — the PRODUCTION cursor-advance. POST /dataexport/{AccountID}/ack/{file}
     * consumes the file from the queue. This is NOT record CRUD and NOT a write capability; it is the
     * feed's "advance the cursor" primitive, invoked ONLY by the real sync queue-advance path after a file
     * is fully imported. It is NEVER called from FetchChanges or from any test (read-only testing only).
     */
    public async AcknowledgeFile(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        fileName: string
    ): Promise<boolean> {
        const auth = await this.Authenticate(companyIntegration, contextUser) as PropFuelAuthContext;
        const url = `${this.accountBasePath(auth)}/ack/${encodeURIComponent(fileName)}`;
        const headers = this.BuildHeaders(auth);
        const resp = await this.MakeHTTPRequest(auth, url, 'POST', headers);
        return resp.Status >= 200 && resp.Status < 300;
    }

    // ── TestConnection (read-only: list only) ──────────────────────────

    /**
     * Verifies connectivity by hitting GET /dataexport/{AccountID}/list (read-only — no ack, no
     * download mutation). A 2xx response confirms both the bearer token and the account path.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as PropFuelAuthContext;
            const url = `${this.accountBasePath(auth)}/list`;
            const headers = this.BuildHeaders(auth);
            const resp = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (resp.Status < 200 || resp.Status >= 300) {
                return { Success: false, Message: `PropFuel TestConnection failed: HTTP ${resp.Status}` };
            }
            return {
                Success: true,
                Message: 'Successfully connected to PropFuel data-export feed',
                ServerVersion: 'PropFuel data-export API',
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ── File-feed helpers ──────────────────────────────────────────────

    /** Lists available export files via GET /dataexport/{AccountID}/list. */
    private async listFiles(auth: PropFuelAuthContext): Promise<ParsedFeedFile[]> {
        const url = `${this.accountBasePath(auth)}/list`;
        const headers = this.BuildHeaders(auth);
        const resp = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (resp.Status < 200 || resp.Status >= 300) {
            throw new Error(`PropFuel list failed: HTTP ${resp.Status}`);
        }
        const names = this.extractFileNames(resp.Body);
        const parsed: ParsedFeedFile[] = [];
        for (const name of names) {
            const file = this.parseFeedFileName(name);
            if (file) parsed.push(file);
        }
        return parsed;
    }

    /**
     * Downloads one export file via GET /dataexport/{AccountID}/download/{file}.
     * The file body is a JSON array of record objects.
     */
    private async downloadFile(auth: PropFuelAuthContext, fileName: string): Promise<Record<string, unknown>[]> {
        const url = `${this.accountBasePath(auth)}/download/${encodeURIComponent(fileName)}`;
        const headers = this.BuildHeaders(auth);
        const resp = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (resp.Status < 200 || resp.Status >= 300) {
            throw new Error(`PropFuel download failed for "${fileName}": HTTP ${resp.Status}`);
        }
        return this.NormalizeResponse(resp.Body, null);
    }

    /**
     * Selects the export files belonging to `stream`, sorted oldest → newest by microtime,
     * keeping only those strictly after the supplied watermark (the last fully-processed microtime).
     */
    private selectFilesForStream(
        files: ParsedFeedFile[],
        stream: PropFuelStream,
        watermark: string | null
    ): ParsedFeedFile[] {
        const token = STREAM_FILENAME_TOKEN[stream];
        const watermarkValue = watermark != null && watermark.length > 0 ? Number(watermark) : null;
        const filtered = files.filter(f => {
            if (f.DataType !== token) return false;
            if (watermarkValue == null || Number.isNaN(watermarkValue)) return true;
            return f.MicrotimeValue > watermarkValue;
        });
        // Sort ascending by microtime so we process oldest first and advance the cursor monotonically.
        filtered.sort((a, b) => a.MicrotimeValue - b.MicrotimeValue);
        return filtered;
    }

    /**
     * Parses a feed filename `[microtime]-[data type].json` into its parts.
     * Returns null when the name doesn't match the expected pattern.
     */
    private parseFeedFileName(name: string): ParsedFeedFile | null {
        const trimmed = name.replace(/\.json$/i, '');
        const dashIdx = trimmed.indexOf('-');
        if (dashIdx <= 0) return null;
        const microtime = trimmed.slice(0, dashIdx);
        const dataType = trimmed.slice(dashIdx + 1);
        const microtimeValue = Number(microtime);
        if (Number.isNaN(microtimeValue)) return null;
        return { FileName: name, Microtime: microtime, MicrotimeValue: microtimeValue, DataType: dataType };
    }

    /**
     * Extracts filenames from the list-endpoint response, tolerating both a bare string array
     * and an array of objects carrying the name under `file` / `name` / `filename`.
     */
    private extractFileNames(body: unknown): string[] {
        const arr = Array.isArray(body)
            ? body
            : (body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).files)
                ? (body as Record<string, unknown>).files as unknown[]
                : []);
        const out: string[] = [];
        for (const item of arr) {
            if (typeof item === 'string') {
                out.push(item);
            } else if (item && typeof item === 'object') {
                const o = item as Record<string, unknown>;
                const candidate = o.file ?? o.name ?? o.filename;
                if (typeof candidate === 'string') out.push(candidate);
            }
        }
        return out;
    }

    /**
     * Flattens a raw download record into an ExternalRecord with the exact IOF column names and
     * builds the record identity. checkin_questions is upsert-by-identity (PK = checkin_question.id)
     * with soft-delete tombstones (deleted_at presence → IsDeleted); clicks/opens are insert-only.
     */
    private buildExternalRecord(raw: Record<string, unknown>, stream: PropFuelStream): ExternalRecord {
        const fields = this.flattenRecord(raw, stream);
        const pkColumn = STREAM_PK_COLUMN[stream];
        const pkValue = fields[pkColumn];
        const externalID = pkValue != null ? String(pkValue) : '';

        const record: ExternalRecord = {
            ExternalID: externalID,
            ObjectType: stream,
            Fields: fields,
        };

        // Tombstone application: only checkin_questions carries a soft-delete column.
        const tombstoneColumn = STREAM_TOMBSTONE_COLUMN[stream];
        if (tombstoneColumn) {
            const tombstone = fields[tombstoneColumn];
            record.IsDeleted = tombstone != null && String(tombstone).trim().length > 0;
        } else {
            record.IsDeleted = false;
        }

        return record;
    }

    /**
     * Flattens the raw record's nested objects into the per-stream column names, per
     * STREAM_FLATTEN_RULES. Any object key present in the raw record but not covered by a rule
     * is flattened generically under its own key with the stream's default separator, so no
     * proven field is silently dropped if the vendor adds one.
     */
    private flattenRecord(raw: Record<string, unknown>, stream: PropFuelStream): Record<string, unknown> {
        const rules = STREAM_FLATTEN_RULES[stream];
        const defaultSeparator = stream === 'checkin_questions' ? '.' : '_';
        const out: Record<string, unknown> = {};
        const handledKeys = new Set(rules.map(r => r.SourceKey));

        for (const rule of rules) {
            const nested = raw[rule.SourceKey];
            if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
                for (const [leaf, value] of Object.entries(nested as Record<string, unknown>)) {
                    out[`${rule.Prefix}${rule.Separator}${leaf}`] = value;
                }
            }
        }

        // Generic fallthrough for any nested object/scalar the rules didn't cover.
        for (const [key, value] of Object.entries(raw)) {
            if (handledKeys.has(key)) continue;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                for (const [leaf, leafValue] of Object.entries(value as Record<string, unknown>)) {
                    out[`${key}${defaultSeparator}${leaf}`] = leafValue;
                }
            } else {
                out[key] = value;
            }
        }

        return out;
    }

    private accountBasePath(auth: PropFuelAuthContext): string {
        const base = (auth.Config.BaseURL ?? PROPFUEL_DEFAULT_BASE_URL).replace(/\/+$/, '');
        return `${base}/dataexport/${encodeURIComponent(auth.Config.AccountID)}`;
    }

    private normalizeStream(objectName: string): PropFuelStream | null {
        const lower = objectName.toLowerCase();
        return (PROPFUEL_STREAMS as readonly string[]).includes(lower) ? (lower as PropFuelStream) : null;
    }

    private streamLabel(stream: PropFuelStream): string {
        switch (stream) {
            case 'checkin_questions': return 'Check-in Questions';
            case 'clicks': return 'Clicks';
            case 'opens': return 'Opens';
        }
    }

    private streamDescription(stream: PropFuelStream): string {
        switch (stream) {
            case 'checkin_questions':
                return 'PropFuel check-in question (Q&A) records — mutable upsert-with-soft-delete stream sourced from the file feed.';
            case 'clicks':
                return 'PropFuel link-click event stream — insert-only append feed.';
            case 'opens':
                return 'PropFuel email/message open event stream — insert-only append feed.';
        }
    }

    // ── Abstract REST hooks (BaseRESTIntegrationConnector) ─────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        const config = await this.parseConfig(companyIntegration, contextUser);
        return { Token: config.Token, Config: config } as PropFuelAuthContext;
    }

    /**
     * Builds the auth + content headers sent on EVERY request:
     *  - Authorization: Bearer <token>
     *  - Content-Type: application/json
     *
     * A bearer token in a header is not a crypto operation (no signing/hashing), so it is set
     * directly here; there is no inlined cryptography.
     */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const token = auth.Token ?? '';
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
    }

    /**
     * NormalizeResponse for the file feed: a downloaded file body is a JSON ARRAY of record
     * objects at the root. responseDataKey is always null for this connector.
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (responseDataKey) {
            const body = rawBody as Record<string, unknown> | null;
            const arr = body ? body[responseDataKey] : undefined;
            return Array.isArray(arr) ? (arr as Record<string, unknown>[]) : [];
        }
        return Array.isArray(rawBody) ? (rawBody as Record<string, unknown>[]) : [];
    }

    /**
     * The file feed is not page-paginated — each list response returns all available files and the
     * connector walks them itself. Required for abstract-contract compliance; always reports no more pages.
     */
    protected ExtractPaginationInfo(
        _rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        return { HasMore: false };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        const pf = auth as PropFuelAuthContext;
        return (pf.Config?.BaseURL ?? PROPFUEL_DEFAULT_BASE_URL).replace(/\/+$/, '');
    }

    // ── HTTP transport ─────────────────────────────────────────────────

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const pf = auth as PropFuelAuthContext;
        const maxRetries = pf.Config?.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = pf.Config?.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const resp = await this.doFetch(url, method, headers, body, timeoutMs);
                this.lastRequestTime = Date.now();
                if ((resp.Status === 429 || resp.Status === 503) && attempt < maxRetries) {
                    await this.sleep(this.backoffMs(attempt));
                    continue;
                }
                return resp;
            } catch (err: unknown) {
                if (attempt === maxRetries || !this.isRetryableError(err)) throw err;
                await this.sleep(this.backoffMs(attempt));
            }
        }
        throw new Error(`PropFuel request to ${url} exhausted ${maxRetries + 1} attempts`);
    }

    /** Executes a single fetch() with an AbortController-backed timeout. `protected` so tests can
     *  drive the 429/503 retry loop in MakeHTTPRequest by overriding the single-fetch primitive. */
    protected async doFetch(
        url: string,
        method: string,
        headers: Record<string, string>,
        body: unknown,
        timeoutMs: number
    ): Promise<RESTResponse> {
        const controller = new AbortController();
        const handle = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(url, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            const respHeaders: Record<string, string> = {};
            resp.headers.forEach((value, key) => { respHeaders[key.toLowerCase()] = value; });
            const text = await resp.text();
            const parsed = text.length > 0 ? this.safeParseJSON(text) : null;
            return { Status: resp.status, Body: parsed, Headers: respHeaders };
        } finally {
            clearTimeout(handle);
        }
    }

    private safeParseJSON(text: string): unknown {
        try { return JSON.parse(text) as unknown; } catch { return text; }
    }

    private isRetryableError(err: unknown): boolean {
        const msg = err instanceof Error ? err.message : String(err);
        return /abort|timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT|network/i.test(msg);
    }

    private backoffMs(attempt: number): number {
        const base = Math.min(1000 * Math.pow(2, attempt), 15000);
        return base + Math.floor(Math.random() * 250);
    }

    /** `protected` so tests can no-op the backoff wait (keeping the retry loop instant + asserting backoff growth). */
    protected sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ── Config parsing ─────────────────────────────────────────────────

    /**
     * Resolves { Token, AccountID } from the bound credential (preferred) or the
     * CompanyIntegration.Configuration JSON fallback. Validates with Zod.
     */
    private async parseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<PropFuelConnectionConfig> {
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const fromCred = await this.loadFromCredential(credentialID, contextUser);
            if (fromCred) return fromCred;
        }
        const raw = companyIntegration.Configuration;
        if (!raw) {
            throw new Error('PropFuelConnector: No credential or Configuration JSON found on CompanyIntegration');
        }
        return this.validateConfig(JSON.parse(raw) as unknown);
    }

    private async loadFromCredential(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<PropFuelConnectionConfig | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        try {
            return this.validateConfig(JSON.parse(credential.Values) as unknown);
        } catch {
            return null;
        }
    }

    private validateConfig(raw: unknown): PropFuelConnectionConfig {
        const parsed = PropFuelConnectionConfigSchema.safeParse(raw);
        if (!parsed.success) {
            throw new Error(`PropFuelConnector: invalid configuration — ${parsed.error.issues.map(i => i.message).join('; ')}`);
        }
        return {
            Token: parsed.data.Token,
            AccountID: parsed.data.AccountID,
            BaseURL: parsed.data.BaseURL,
            MaxRetries: parsed.data.MaxRetries ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: parsed.data.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        };
    }
}

/** Tree-shaking prevention function — import and call from module entry point. */
export function LoadPropFuelConnector(): void { /* no-op */ }
