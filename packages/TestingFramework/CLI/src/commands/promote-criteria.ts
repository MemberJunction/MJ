/**
 * @fileoverview Promote a test's inline criteria into a draft rubric.
 * @module @memberjunction/testing-cli
 */

import { RunInEntityTransaction, RunView, UserInfo, type EntityTransactionScope, type IMetadataProvider } from '@memberjunction/core';
import { TestEngine, BINARY_SCALE_NAME, BuildPromotedRubric, PromoteInlineCriteria, type PromoteCriteriaStore, type PromotedRubric } from '@memberjunction/testing-engine';
import { UUIDsEqual } from '@memberjunction/global';
import { MJRubricCriterionEntity, MJRubricEntity, MJRubricScaleEntity, MJRubricScaleLevelEntity, MJRubricVersionEntity, MJTestEntity } from '@memberjunction/core-entities';
import { OutputFormatter } from '../utils/output-formatter';
import { initializeMJProvider, closeMJProvider, getContextUser } from '../lib/mj-provider';

/**
 * `mj test promote-criteria <test>` copies inline judge criteria onto a Draft rubric and sets
 * `Test.RubricID`. The version is not published.
 */
export class PromoteCriteriaCommand {
    async Execute(testRef: string, contextUser?: UserInfo): Promise<void> {
        try {
            await initializeMJProvider();
            const user = contextUser ?? await getContextUser();
            const engine = TestEngine.Instance;
            await engine.Config(false, user);
            const matches = engine.Tests.filter(test => test.Name === testRef || UUIDsEqual(test.ID, testRef));
            if (matches.length === 0) {
                console.error(OutputFormatter.formatError(`No test matches "${testRef}".`));
                process.exitCode = 1;
                await closeMJProvider();
                return;
            }
            if (matches.length > 1) {
                console.error(OutputFormatter.formatError(`More than one test is named "${testRef}". Pass the test ID.`));
                process.exitCode = 1;
                await closeMJProvider();
                return;
            }
            const test = matches[0];
            const plan = BuildPromotedRubric({
                testName: test.Name,
                testId: test.ID,
                existingRubricId: test.RubricID,
                expectedOutcomes: test.ExpectedOutcomes,
                configuration: test.Configuration,
            });
            if (!plan.ok) {
                console.error(OutputFormatter.formatError(plan.message));
                process.exitCode = 1;
                await closeMJProvider();
                return;
            }
            const provider = test.ProviderToUse as unknown as IMetadataProvider & {
                SupportsEntityTransactions?: boolean;
                BeginEntityTransaction?(): Promise<EntityTransactionScope>;
            };
            const saved = await RunInEntityTransaction(provider, () => PromoteInlineCriteria(test.ID, plan.rubric, providerStore(test, user, provider)));
            console.log(`Promoted ${plan.rubric.criteria.length} criteria from "${test.Name}" into draft rubric "${plan.rubric.name}".`);
            console.log(`Rubric ${saved.rubricId}, version ${saved.versionId}. The version is Draft and was not published. Test.RubricID is set.`);
            await closeMJProvider();
        } catch (error) {
            console.error(OutputFormatter.formatError('Failed to promote criteria', error as Error));
            try {
                await closeMJProvider();
            } catch {
                // The provider may not have opened.
            }
            process.exit(1);
        }
    }
}

function providerStore(test: MJTestEntity, user: UserInfo, provider: IMetadataProvider): PromoteCriteriaStore {
    return {
        async saveRubric(input) {
            const row = await provider.GetEntityObject<MJRubricEntity>('MJ: Rubrics', user);
            row.NewRecord();
            row.Name = input.name;
            row.Description = input.description;
            row.Status = 'Active';
            if (!await row.Save()) throw new Error(row.LatestResult?.Message || 'Could not create the rubric.');
            return row.ID;
        },
        async ensureBinaryScale() {
            const view = RunView.FromMetadataProvider(provider);
            const found = await view.RunView({
                EntityName: 'MJ: Rubric Scales',
                ExtraFilter: `Name='${BINARY_SCALE_NAME.replace(/'/g, "''")}'`,
                ResultType: 'simple',
                MaxRows: 1,
            }, user);
            if (!found.Success) throw new Error(found.ErrorMessage || 'Could not read MJ: Rubric Scales.');
            const existing = found.Results?.[0] as { ID?: string } | undefined;
            if (existing?.ID) return String(existing.ID);
            const scale = await provider.GetEntityObject<MJRubricScaleEntity>('MJ: Rubric Scales', user);
            scale.NewRecord();
            scale.Name = BINARY_SCALE_NAME;
            scale.ScaleType = 'Levels';
            scale.HigherIsBetter = true;
            scale.Status = 'Active';
            if (!await scale.Save()) throw new Error(scale.LatestResult?.Message || 'Could not create the binary scale.');
            const scaleId = scale.ID;
            for (const level of [
                { label: 'Not met', value: 0, normalized: 0, sequence: 0 },
                { label: 'Met', value: 1, normalized: 1, sequence: 1 },
            ]) {
                const row = await provider.GetEntityObject<MJRubricScaleLevelEntity>('MJ: Rubric Scale Levels', user);
                row.NewRecord();
                row.ScaleID = scaleId;
                row.Label = level.label;
                row.Value = level.value;
                row.NormalizedValue = level.normalized;
                row.Sequence = level.sequence;
                if (!await row.Save()) throw new Error(row.LatestResult?.Message || `Could not save scale level ${level.label}.`);
            }
            return scaleId;
        },
        async saveDraftVersion(input) {
            return saveDraft(input, user, provider);
        },
        async setTestRubric(_testId, rubricId) {
            test.RubricID = rubricId;
            if (!await test.Save()) throw new Error(test.LatestResult?.Message || 'Could not set Test.RubricID.');
        },
    };
}

async function saveDraft(input: PromotedRubric & { rubricId: string; scaleId: string }, user: UserInfo, provider: IMetadataProvider): Promise<string> {
    const version = await provider.GetEntityObject<MJRubricVersionEntity>('MJ: Rubric Versions', user);
    version.NewRecord();
    version.RubricID = input.rubricId;
    version.Status = 'Draft';
    version.PassThreshold = input.passThreshold;
    version.NotApplicablePolicy = input.notApplicablePolicy;
    version.ScoreDisplayMin = input.scoreDisplayMin;
    version.ScoreDisplayMax = input.scoreDisplayMax;
    if (!await version.Save()) throw new Error(version.LatestResult?.Message || 'Could not create the draft version.');
    const versionId = version.ID;
    for (const criterion of input.criteria) {
        const row = await provider.GetEntityObject<MJRubricCriterionEntity>('MJ: Rubric Criteria', user);
        row.NewRecord();
        row.RubricVersionID = versionId;
        row.Key = criterion.key;
        row.Name = criterion.name;
        row.NodeType = 'Criterion';
        row.ScaleID = input.scaleId;
        row.Weight = criterion.weight;
        row.IsAdvisory = false;
        row.IsGate = criterion.isGate;
        row.GateMinimumScore = criterion.gateMinimumScore;
        row.EvidenceRequired = false;
        row.RationaleRequired = false;
        row.Sequence = criterion.sequence;
        if (!await row.Save()) throw new Error(row.LatestResult?.Message || `Could not save criterion ${criterion.key}.`);
    }
    return versionId;
}
