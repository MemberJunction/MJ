import { readFileSync } from 'fs';
import { RunView, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { RubricVersionDiff, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { providerRubricEngine } from '@memberjunction/rubrics';
import { InitializeMJProvider, GetContextUser, GetMJProvider } from '../lib/mj-provider';
import { FormatVersionDiff, ParseRubricRef, RequireViewSuccess, RubricIdentityFilter, SnapshotFromRows, ValidateSnapshot } from './rubric-cli';

/** Thin database operations behind `mj rubric`. */
export class RubricCommands {
    async List(): Promise<void> {
        const { user } = await this.context();
        const rows = await this.rows('MJ: Rubrics', undefined, user);
        if (rows.length === 0) {
            console.log('No rubrics.');
            return;
        }
        for (const row of rows) console.log(`${row.Name}  ${row.Status}  ${row.ID}`);
    }

    async Show(ref: string): Promise<void> {
        const { user } = await this.context();
        const { rubric, version } = await this.version(ref, user);
        console.log(`${rubric.Name}  ${version.MajorVersion}.${version.MinorVersion}.${version.PatchVersion}  ${version.Status}`);
        const criteria = await this.rows('MJ: Rubric Criteria', `RubricVersionID='${String(version.ID).replace(/'/g, "''")}'`, user);
        for (const criterion of criteria) console.log(`${criterion.Key}  ${criterion.Name}  weight ${criterion.Weight}`);
    }

    async Diff(ref: string, from: string, to: string): Promise<void> {
        const { user } = await this.context();
        const parsed = ParseRubricRef(ref);
        const left = await this.snapshot(parsed.rubric, from, user);
        const right = await this.snapshot(parsed.rubric, to, user);
        console.log(FormatVersionDiff(RubricVersionDiff.diff(left, right)));
    }

    Validate(file: string): void {
        const snapshot = JSON.parse(readFileSync(file, 'utf8')) as RubricVersionSnapshot;
        const errors = ValidateSnapshot(snapshot);
        if (errors.length === 0) {
            console.log('Valid.');
            return;
        }
        for (const error of errors) console.error(error);
        process.exit(1);
    }

    async Evaluate(ref: string, entity: string, record: string, evaluator: string | undefined): Promise<void> {
        const { user, provider } = await this.context();
        const { rubric, version } = await this.version(ref, user);
        const engine = providerRubricEngine(provider, user);
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

    private async version(ref: string, user: UserInfo): Promise<{ rubric: Record<string, unknown>; version: Record<string, unknown> }> {
        const parsed = ParseRubricRef(ref);
        const rubrics = await this.rows('MJ: Rubrics', RubricIdentityFilter(parsed.rubric), user);
        const rubric = rubrics.find(row => UUIDsEqual(row.ID == null ? null : String(row.ID), parsed.rubric) || String(row.Name) === parsed.rubric);
        if (!rubric) throw new Error(`Rubric "${parsed.rubric}" was not found.`);
        const versions = await this.rows('MJ: Rubric Versions', `RubricID='${String(rubric.ID).replace(/'/g, "''")}'`, user);
        const version = parsed.version
            ? versions.find(row => `${row.MajorVersion}.${row.MinorVersion}.${row.PatchVersion}` === parsed.version || UUIDsEqual(row.ID == null ? null : String(row.ID), parsed.version))
            : versions.filter(row => String(row.Status) === 'Published').sort((left, right) => Number(right.MajorVersion) - Number(left.MajorVersion) || Number(right.MinorVersion) - Number(left.MinorVersion) || Number(right.PatchVersion) - Number(left.PatchVersion))[0];
        if (!version) throw new Error(`Version ${parsed.version ?? 'published'} was not found on ${rubric.Name}.`);
        return { rubric, version };
    }

    private async snapshot(rubricRef: string, versionRef: string, user: UserInfo): Promise<RubricVersionSnapshot> {
        const { version } = await this.version(`${rubricRef}@${versionRef}`, user);
        const versionId = String(version.ID).replace(/'/g, "''");
        const criteria = await this.rows('MJ: Rubric Criteria', `RubricVersionID='${versionId}'`, user);
        const scaleIds = [...new Set(criteria.map(row => row.ScaleID).filter(id => id != null && id !== '').map(id => `'${String(id).replace(/'/g, "''")}'`))];
        const scales = scaleIds.length === 0 ? [] : await this.rows('MJ: Rubric Scales', `ID IN (${scaleIds.join(', ')})`, user);
        const levels = scaleIds.length === 0 ? [] : await this.rows('MJ: Rubric Scale Levels', `ScaleID IN (${scaleIds.join(', ')})`, user);
        const bands = await this.rows('MJ: Rubric Bands', `RubricVersionID='${versionId}'`, user);
        return SnapshotFromRows(version, criteria, scales, levels, bands);
    }

    private async context(): Promise<{ user: UserInfo; provider: IMetadataProvider }> {
        await InitializeMJProvider();
        return { user: await GetContextUser(), provider: GetMJProvider() };
    }

    private async rows(entityName: string, filter: string | undefined, user: UserInfo): Promise<Record<string, unknown>[]> {
        const view = RunView.FromMetadataProvider(GetMJProvider());
        const result = await view.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple', MaxRows: 500 }, user);
        RequireViewSuccess(result, entityName);
        return (result.Results ?? []) as Record<string, unknown>[];
    }
}
