import { readFileSync } from 'node:fs';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { RubricVersionDiff, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { FormatVersionDiff, ParseRubricRef, RequireViewSuccess, RubricIdentityFilter, SnapshotFromRows, ValidateSnapshot } from './rubricCli.js';
import { ProviderRubricEngine } from './providerRecords.js';

/** Database work behind `mj rubric`. The caller opens the provider and closes it. */
export class RubricCommands {
    public constructor(private provider: IMetadataProvider, private user: UserInfo) {}

    public async List(): Promise<void> {
        const rows = await this.rows('MJ: Rubrics');
        if (rows.length === 0) {
            console.log('No rubrics.');
            return;
        }
        for (const row of rows) console.log(`${row.Name}  ${row.Status}  ${row.ID}`);
    }

    public async Show(ref: string): Promise<void> {
        const { rubric, version } = await this.version(ref);
        console.log(`${rubric.Name}  ${version.MajorVersion}.${version.MinorVersion}.${version.PatchVersion}  ${version.Status}`);
        const criteria = await this.rows('MJ: Rubric Criteria', `RubricVersionID='${String(version.ID).replace(/'/g, "''")}'`);
        for (const criterion of criteria) console.log(`${criterion.Key}  ${criterion.Name}  weight ${criterion.Weight}`);
    }

    public async Diff(ref: string, from: string, to: string): Promise<void> {
        const parsed = ParseRubricRef(ref);
        const left = await this.snapshot(parsed.rubric, from);
        const right = await this.snapshot(parsed.rubric, to);
        console.log(FormatVersionDiff(RubricVersionDiff.Diff(left, right)));
    }

    public static Validate(file: string): void {
        const snapshot = JSON.parse(readFileSync(file, 'utf8')) as RubricVersionSnapshot;
        const errors = ValidateSnapshot(snapshot);
        if (errors.length === 0) {
            console.log('Valid.');
            return;
        }
        for (const error of errors) console.error(error);
        process.exit(1);
    }

    public async Evaluate(ref: string, entity: string, record: string, evaluator: string | undefined): Promise<void> {
        const { rubric, version } = await this.version(ref);
        const engine = ProviderRubricEngine(this.provider, this.user);
        const result = await engine.EvaluateRecord({
            rubricId: String(rubric.ID),
            versionId: String(version.ID),
            subjectEntityName: entity,
            subjectRecordId: record,
            evaluator: evaluator === 'Deterministic' ? 'Deterministic' : 'LLM',
        });
        console.log(`${result.outcome ?? ''}  ${result.score ?? ''}`);
        for (const criterion of result.criteria ?? []) console.log(`${criterion.key}  ${criterion.normalizedScore ?? '—'}`);
    }

    private async version(ref: string): Promise<{ rubric: Record<string, unknown>; version: Record<string, unknown> }> {
        const parsed = ParseRubricRef(ref);
        const rubrics = await this.rows('MJ: Rubrics', RubricIdentityFilter(parsed.rubric));
        const rubric = rubrics.find(row => UUIDsEqual(row.ID == null ? null : String(row.ID), parsed.rubric) || String(row.Name) === parsed.rubric);
        if (!rubric) throw new Error(`Rubric "${parsed.rubric}" was not found.`);
        const versions = await this.rows('MJ: Rubric Versions', `RubricID='${String(rubric.ID).replace(/'/g, "''")}'`);
        const version = parsed.version
            ? versions.find(row => `${row.MajorVersion}.${row.MinorVersion}.${row.PatchVersion}` === parsed.version || UUIDsEqual(row.ID == null ? null : String(row.ID), parsed.version))
            : versions.filter(row => String(row.Status) === 'Published').sort((left, right) => Number(right.MajorVersion) - Number(left.MajorVersion) || Number(right.MinorVersion) - Number(left.MinorVersion) || Number(right.PatchVersion) - Number(left.PatchVersion))[0];
        if (!version) throw new Error(`Version ${parsed.version ?? 'published'} was not found on ${rubric.Name}.`);
        return { rubric, version };
    }

    private async snapshot(rubricRef: string, versionRef: string): Promise<RubricVersionSnapshot> {
        const { version } = await this.version(`${rubricRef}@${versionRef}`);
        const versionId = String(version.ID).replace(/'/g, "''");
        const criteria = await this.rows('MJ: Rubric Criteria', `RubricVersionID='${versionId}'`);
        const scaleIds = [...new Set(criteria.map(row => row.ScaleID).filter(id => id != null && id !== '').map(id => `'${String(id).replace(/'/g, "''")}'`))];
        const scales = scaleIds.length === 0 ? [] : await this.rows('MJ: Rubric Scales', `ID IN (${scaleIds.join(', ')})`);
        const levels = scaleIds.length === 0 ? [] : await this.rows('MJ: Rubric Scale Levels', `ScaleID IN (${scaleIds.join(', ')})`);
        const bands = await this.rows('MJ: Rubric Bands', `RubricVersionID='${versionId}'`);
        return SnapshotFromRows(version, criteria, scales, levels, bands);
    }

    private async rows(entityName: string, filter?: string): Promise<Record<string, unknown>[]> {
        const view = RunView.FromMetadataProvider(this.provider);
        const result = await view.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple', MaxRows: 500 }, this.user);
        RequireViewSuccess(result, entityName);
        return (result.Results ?? []) as Record<string, unknown>[];
    }
}
