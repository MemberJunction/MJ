/**
 * Atomic read/write for connector metadata files. Used by the MCP server's
 * tool handlers so agents can't corrupt files via partial writes.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.18.2
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type {
    IntegrationMetadataFile,
    IntegrationObjectPayload,
    IntegrationObjectFieldPayload,
    ProvenanceEntry,
    CodeEvidenceEntry,
} from './types.js';

export class MetadataFileStore {
    /**
     * @param registryRoot Root of the connectors registry (`<repoRoot>/packages/Integration/connectors-registry`).
     *                     Used for PROVENANCE.json / CODE_EVIDENCE.json side-files.
     * @param metadataRoot Root of the mj-sync metadata tree for integrations
     *                     (`<repoRoot>/metadata/integrations`). This is what `mj sync push`
     *                     scans (glob `**\/.*.integration.json`), so the integration file
     *                     MUST be written here — not under the registry root.
     */
    constructor(private readonly registryRoot: string, private readonly metadataRoot: string) {}

    /**
     * Read the metadata file for a connector. Returns the parsed
     * {@link IntegrationMetadataFile} shape, or `null` if the file does not exist.
     *
     * The on-disk file is a top-level JSON array (the shape `mj sync push` expects);
     * we unwrap element 0 into the flat in-memory shape. A bare object is also
     * tolerated for backward-compat with any legacy non-array file.
     */
    public ReadIntegration(connectorName: string): IntegrationMetadataFile | null {
        const path = this.IntegrationFilePath(connectorName);
        if (!existsSync(path))
            return null;
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
        if (Array.isArray(parsed))
            return (parsed[0] as IntegrationMetadataFile | undefined) ?? null;
        return parsed as IntegrationMetadataFile;
    }

    /**
     * Upsert root-level integration fields (the `fields` block on the integration
     * metadata file). Merges into the existing fields object — keys present in
     * `fields` overwrite, keys absent are preserved. Used by MetadataWriter to
     * populate the Phase 0 hot-path columns (CredentialTypeID, APIBaseURL,
     * TokenRefreshStrategy, PaginationCursorParamName, IncrementalSyncCapability,
     * WebhooksAvailable, BulkOperationsAvailable, etc.) without touching IO/IOF rows.
     */
    public UpsertIntegrationFields(connectorName: string, fields: Record<string, unknown>): void {
        const file = this.ReadIntegration(connectorName) ?? this.NewEmptyFile(connectorName);
        file.fields = { ...file.fields, ...fields };
        this.WriteIntegration(connectorName, file);
    }

    /**
     * Insert or update an Integration Object row in the connector metadata file.
     * Match key is `io.Name` (case-insensitive). Existing fields are merged;
     * keys present in `io` overwrite.
     */
    public UpsertIO(connectorName: string, io: IntegrationObjectPayload & Record<string, unknown>): void {
        const file = this.ReadIntegration(connectorName) ?? this.NewEmptyFile(connectorName);
        const ios = file.relatedEntities?.['MJ: Integration Objects'] ?? [];
        // Every IO under an Integration MUST carry its parent FK or `mj sync push` fails with
        // "IntegrationID cannot be null" → full rollback (metadata-file-conventions §3). Auto-inject
        // the deploy-safe @parent ref so the extractor can never omit it.
        if (io.IntegrationID == null) io.IntegrationID = '@parent:ID';
        const idx = ios.findIndex((i) => i.fields.Name.toLowerCase() === io.Name.toLowerCase());
        if (idx >= 0) {
            ios[idx].fields = { ...ios[idx].fields, ...io };
        }
        else {
            ios.push({ fields: io });
        }
        file.relatedEntities = { ...(file.relatedEntities ?? {}), 'MJ: Integration Objects': ios };
        this.WriteIntegration(connectorName, file);
    }

    /**
     * Insert or update an Integration Object Field row under a given IO. Creates
     * the IO if it does not exist. Match key is `iof.Name` (case-insensitive)
     * within the named IO.
     */
    public UpsertIOF(connectorName: string, ioName: string, iof: IntegrationObjectFieldPayload & Record<string, unknown>): void {
        const file = this.ReadIntegration(connectorName) ?? this.NewEmptyFile(connectorName);
        const ios = file.relatedEntities?.['MJ: Integration Objects'] ?? [];
        let io = ios.find((i) => i.fields.Name.toLowerCase() === ioName.toLowerCase());
        if (!io) {
            io = { fields: { Name: ioName, IntegrationID: '@parent:ID' } };
            ios.push(io);
        }
        const related = io.relatedEntities ?? {};
        const iofs = related['MJ: Integration Object Fields'] ?? [];
        // Every IOF under an IO MUST carry its parent FK or `mj sync push` fails with
        // "IntegrationObjectID cannot be null" → full rollback (the leak #13 deploy defect: 1077
        // IOFs missing it). Auto-inject the @parent ref so the extractor can never omit it.
        if (iof.IntegrationObjectID == null) iof.IntegrationObjectID = '@parent:ID';
        const idx = iofs.findIndex((f) => f.fields.Name.toLowerCase() === iof.Name.toLowerCase());
        if (idx >= 0) {
            iofs[idx].fields = { ...iofs[idx].fields, ...iof };
        }
        else {
            iofs.push({ fields: iof });
        }
        related['MJ: Integration Object Fields'] = iofs;
        io.relatedEntities = related;
        file.relatedEntities = { ...(file.relatedEntities ?? {}), 'MJ: Integration Objects': ios };
        this.WriteIntegration(connectorName, file);
    }

    /** Append a provenance entry to `<connector>/PROVENANCE.json`. */
    public AppendProvenance(connectorName: string, entry: ProvenanceEntry): void {
        const path = resolve(this.registryRoot, connectorName, 'PROVENANCE.json');
        const current: { Entries: ProvenanceEntry[] } = existsSync(path)
            ? JSON.parse(readFileSync(path, 'utf-8'))
            : { Entries: [] };
        current.Entries.push(entry);
        this.WriteAtomic(path, JSON.stringify(current, null, 2) + '\n');
    }

    /** Append a code-evidence entry to `<connector>/CODE_EVIDENCE.json`. */
    public AppendCodeEvidence(connectorName: string, entry: CodeEvidenceEntry): void {
        const path = resolve(this.registryRoot, connectorName, 'CODE_EVIDENCE.json');
        const current: { Entries: CodeEvidenceEntry[] } = existsSync(path)
            ? JSON.parse(readFileSync(path, 'utf-8'))
            : { Entries: [] };
        current.Entries.push(entry);
        this.WriteAtomic(path, JSON.stringify(current, null, 2) + '\n');
    }

    /**
     * Persist the in-memory integration file to disk in the canonical mj-sync
     * shape: a TOP-LEVEL JSON ARRAY with one element. `mj sync push` matches
     * `**\/.*.integration.json` and expects an array of `{ fields, relatedEntities }`
     * records, so we wrap the single file in a one-element array on write.
     */
    private WriteIntegration(connectorName: string, file: IntegrationMetadataFile): void {
        this.WriteAtomic(this.IntegrationFilePath(connectorName), JSON.stringify([file], null, 2) + '\n');
    }

    /**
     * Canonical mj-sync metadata path for a connector:
     *   `<metadataRoot>/<vendorSlug>/.<vendorSlug>.integration.json`
     * where vendorSlug is the connector name lowercased. The `.integration.json`
     * suffix and the per-connector subdirectory are required for `mj sync push`'s
     * `**\/.*.integration.json` glob to pick the file up.
     */
    private IntegrationFilePath(connectorName: string): string {
        const slug = connectorName.toLowerCase();
        return resolve(this.metadataRoot, slug, `.${slug}.integration.json`);
    }

    private NewEmptyFile(connectorName: string): IntegrationMetadataFile {
        return {
            fields: {
                Name: connectorName,
                ClassName: `${connectorName.charAt(0).toUpperCase()}${connectorName.slice(1)}Connector`,
            },
            relatedEntities: { 'MJ: Integration Objects': [] },
        };
    }

    private WriteAtomic(filePath: string, content: string): void {
        mkdirSync(dirname(filePath), { recursive: true });
        // Backup if file exists — keeps the previous state recoverable.
        if (existsSync(filePath)) {
            const backupDir = join(dirname(filePath), '.backups');
            mkdirSync(backupDir, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            copyFileSync(filePath, join(backupDir, `${basename(filePath)}.${stamp}.bak`));
        }
        const tmp = join(dirname(filePath), `.${basename(filePath)}.tmp-${randomBytes(4).toString('hex')}`);
        writeFileSync(tmp, content, 'utf-8');
        renameSync(tmp, filePath);
    }
}
