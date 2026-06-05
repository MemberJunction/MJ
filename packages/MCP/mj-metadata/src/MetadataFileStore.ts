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
    constructor(private readonly registryRoot: string) {}

    /**
     * Read the metadata file for a connector. Returns the parsed
     * {@link IntegrationMetadataFile} shape, or `null` if the file does not exist.
     */
    public ReadIntegration(connectorName: string): IntegrationMetadataFile | null {
        const path = this.IntegrationFilePath(connectorName);
        if (!existsSync(path))
            return null;
        return JSON.parse(readFileSync(path, 'utf-8'));
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
        this.WriteAtomic(this.IntegrationFilePath(connectorName), JSON.stringify(file, null, 2) + '\n');
    }

    /**
     * Insert or update an Integration Object row in the connector metadata file.
     * Match key is `io.Name` (case-insensitive). Existing fields are merged;
     * keys present in `io` overwrite.
     */
    public UpsertIO(connectorName: string, io: IntegrationObjectPayload & Record<string, unknown>): void {
        const file = this.ReadIntegration(connectorName) ?? this.NewEmptyFile(connectorName);
        const ios = file.relatedEntities?.['MJ: Integration Objects'] ?? [];
        const idx = ios.findIndex((i) => i.fields.Name.toLowerCase() === io.Name.toLowerCase());
        if (idx >= 0) {
            ios[idx].fields = { ...ios[idx].fields, ...io };
        }
        else {
            ios.push({ fields: io });
        }
        file.relatedEntities = { ...(file.relatedEntities ?? {}), 'MJ: Integration Objects': ios };
        this.WriteAtomic(this.IntegrationFilePath(connectorName), JSON.stringify(file, null, 2) + '\n');
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
            io = { fields: { Name: ioName } };
            ios.push(io);
        }
        const related = io.relatedEntities ?? {};
        const iofs = related['MJ: Integration Object Fields'] ?? [];
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
        this.WriteAtomic(this.IntegrationFilePath(connectorName), JSON.stringify(file, null, 2) + '\n');
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

    private IntegrationFilePath(connectorName: string): string {
        return resolve(this.registryRoot, connectorName, 'metadata/integrations', `.${connectorName}.json`);
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
