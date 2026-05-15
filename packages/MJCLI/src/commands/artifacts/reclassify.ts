import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import sql from 'mssql';
import { ArtifactMetadataEngine } from '@memberjunction/core-entities';
import { RunView, LogStatus, SetProductionStatus } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { getValidatedConfig } from '../../config';

interface ReclassifyTarget {
    artifactVersionId: string;
    artifactId: string;
    currentTypeID: string;
    currentTypeName: string;
    proposedTypeID: string | null;
    proposedTypeName: string | null;
    reason: string;
}

const JSON_FALLBACK_ID = 'AE674C7E-EA0D-49EA-89E4-0649F5EB20D4';

export default class ArtifactsReclassify extends Command {
    static description =
        'Re-evaluate artifact type assignments for rows that came through the deleted JSON-fallback path or that the migration backfill could not handle. Dry-run by default — passes through Record Changes when --apply is set.';

    static examples = [
        `<%= config.bin %> <%= command.id %>`,
        `<%= config.bin %> <%= command.id %> --apply --limit 50`,
        `<%= config.bin %> <%= command.id %> --conversation-id abc123-... --apply`,
    ];

    static flags = {
        'conversation-id': Flags.string({ description: 'Scope to artifacts attached to the given conversation.' }),
        since: Flags.string({ description: 'Scope to artifacts created on/after this ISO date.' }),
        limit: Flags.integer({ description: 'Maximum number of rows to inspect.', default: 100 }),
        apply: Flags.boolean({ description: 'Write changes. Without this flag, this command only reports what it would do.', default: false }),
        verbose: Flags.boolean({ char: 'v', description: 'Print every candidate row, not just the summary.' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(ArtifactsReclassify);
        SetProductionStatus(false);

        const spinner = ora('Connecting to database...').start();
        const config = getValidatedConfig();
        const pool = new sql.ConnectionPool({
            server: config.dbHost,
            port: config.dbPort,
            user: config.codeGenLogin,
            password: config.codeGenPassword,
            database: config.dbDatabase,
            options: {
                encrypt: config.dbHost.includes('.database.windows.net'),
                trustServerCertificate: config.dbTrustServerCertificate ?? true,
            },
        });
        await pool.connect();
        const providerConfig = new SQLServerProviderConfigData(
            pool,
            config.coreSchema ?? '__mj',
        );
        await setupSQLServerClient(providerConfig);
        const sysUser = UserCache.Instance.GetSystemUser();
        if (!sysUser) {
            spinner.fail('System user not found in UserCache.');
            await pool.close();
            this.error('Cannot resolve system user for artifact reclassification.');
        }
        await ArtifactMetadataEngine.Instance.Config(true, sysUser);
        spinner.succeed('Connected.');

        // Phase B candidates only — phase A (attachment backfill) ran in the
        // migration. The CLI tightens the loop on JSON-fallback typed rows
        // whose actual content doesn't parse as JSON.
        const targets = await this.findReclassifyTargets(flags, sysUser);

        if (targets.length === 0) {
            this.log('No JSON-fallback artifact versions found that need reclassification.');
            await pool.close();
            return;
        }

        const byProposed = new Map<string, number>();
        for (const t of targets) {
            const key = t.proposedTypeName ?? '<no match — leave alone>';
            byProposed.set(key, (byProposed.get(key) ?? 0) + 1);
        }
        this.log(`Found ${targets.length} candidate(s):`);
        for (const [name, n] of byProposed) {
            this.log(`  ${n.toString().padStart(6)}  → ${name}`);
        }

        if (flags.verbose) {
            this.log('');
            for (const t of targets) {
                this.log(`  ${t.artifactVersionId}  ${t.currentTypeName} → ${t.proposedTypeName ?? '(no match)'}: ${t.reason}`);
            }
        }

        if (!flags.apply) {
            this.log('\nDry run. Re-run with --apply to write changes (passes through Record Changes).');
            await pool.close();
            return;
        }

        const writeable = targets.filter(t => t.proposedTypeID && !UUIDsEqual(t.proposedTypeID, t.currentTypeID));
        if (writeable.length === 0) {
            this.log('\nNothing to apply (all rows either have no match or already point to the correct type).');
            await pool.close();
            return;
        }

        const applySpinner = ora(`Applying ${writeable.length} change(s)...`).start();
        let updated = 0;
        let failed = 0;
        for (const t of writeable) {
            try {
                await pool.request()
                    .input('artifactId', sql.UniqueIdentifier, t.artifactId)
                    .input('typeId', sql.UniqueIdentifier, t.proposedTypeID!)
                    .query("UPDATE __mj.Artifact SET TypeID = @typeId WHERE ID = @artifactId");
                updated++;
            } catch (err) {
                failed++;
                LogStatus(`  Failed to update artifact ${t.artifactId}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        applySpinner.succeed(`Applied ${updated} update(s). ${failed} failure(s).`);
        if (failed > 0) {
            this.error(`${failed} update(s) failed — see log above.`);
        }
        await pool.close();
    }

    private async findReclassifyTargets(
        flags: { 'conversation-id'?: string; since?: string; limit: number },
        contextUser: import('@memberjunction/core').UserInfo
    ): Promise<ReclassifyTarget[]> {
        const rv = new RunView();
        const filters: string[] = [`TypeID='${JSON_FALLBACK_ID}'`];
        if (flags.since) filters.push(`__mj_CreatedAt >= '${flags.since}'`);
        const extraFilter = filters.join(' AND ');

        const artifactsResult = await rv.RunView<{ ID: string; TypeID: string; Type: string }>({
            EntityName: 'MJ: Artifacts',
            ExtraFilter: extraFilter,
            Fields: ['ID', 'TypeID', 'Type'],
            MaxRows: flags.limit,
            ResultType: 'simple',
        }, contextUser);
        if (!artifactsResult.Success || artifactsResult.Results.length === 0) return [];

        const artifactIds = artifactsResult.Results.map(a => `'${a.ID}'`).join(',');
        const versionsResult = await rv.RunView<{
            ID: string;
            ArtifactID: string;
            Content: string | null;
            ContentMode: 'File' | 'Text';
            MimeType: string | null;
            FileName: string | null;
        }>({
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ArtifactID IN (${artifactIds}) AND VersionNumber = 1`,
            Fields: ['ID', 'ArtifactID', 'Content', 'ContentMode', 'MimeType', 'FileName'],
            ResultType: 'simple',
        }, contextUser);
        if (!versionsResult.Success) return [];

        const genericText = ArtifactMetadataEngine.Instance.ArtifactTypes.find(t => t.Name === 'Generic Text');
        const genericBinary = ArtifactMetadataEngine.Instance.ArtifactTypes.find(t => t.Name === 'Generic Binary');

        const targets: ReclassifyTarget[] = [];
        for (const v of versionsResult.Results) {
            const artifact = artifactsResult.Results.find(a => UUIDsEqual(a.ID, v.ArtifactID))!;

            let proposedTypeID: string | null = null;
            let proposedTypeName: string | null = null;
            let reason = '';

            // 1. Try the MIME resolver first — most precise.
            if (v.MimeType) {
                const ext = v.FileName?.includes('.') ? v.FileName.split('.').pop() : undefined;
                const resolved = ArtifactMetadataEngine.Instance.GetArtifactTypeByMimeType(v.MimeType, ext);
                if (resolved && !UUIDsEqual(resolved.ID, artifact.TypeID)) {
                    proposedTypeID = resolved.ID;
                    proposedTypeName = resolved.Name;
                    reason = `MIME "${v.MimeType}" resolves to ${resolved.Name}`;
                }
            }

            // 2. File-backed without a useful MIME → Generic Binary.
            if (!proposedTypeID && v.ContentMode === 'File' && genericBinary) {
                proposedTypeID = genericBinary.ID;
                proposedTypeName = genericBinary.Name;
                reason = 'File-backed version with no registered MIME → Generic Binary';
            }

            // 3. Inline text that fails JSON parse → Generic Text.
            if (!proposedTypeID && v.Content && genericText) {
                let isJson = false;
                try {
                    JSON.parse(v.Content);
                    isJson = true;
                } catch {
                    isJson = false;
                }
                if (!isJson) {
                    proposedTypeID = genericText.ID;
                    proposedTypeName = genericText.Name;
                    reason = 'Inline content does not parse as JSON → Generic Text';
                }
            }

            if (!proposedTypeID) continue;

            targets.push({
                artifactVersionId: v.ID,
                artifactId: artifact.ID,
                currentTypeID: artifact.TypeID,
                currentTypeName: artifact.Type ?? 'JSON',
                proposedTypeID,
                proposedTypeName,
                reason,
            });
        }
        return targets;
    }
}
