/**
 * @fileoverview Promote a test's inline criteria into a draft rubric.
 * @module @memberjunction/testing-cli
 */

import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { TestEngine, BINARY_SCALE_NAME, BuildPromotedRubric, PromoteInlineCriteria, type PromoteCriteriaStore, type PromotedRubric } from '@memberjunction/testing-engine';
import { UUIDsEqual } from '@memberjunction/global';
import { MJTestEntity } from '@memberjunction/core-entities';
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
            if (!contextUser) contextUser = await getContextUser();
            const engine = TestEngine.Instance;
            await engine.Config(false, contextUser);
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
            const saved = await PromoteInlineCriteria(test.ID, plan.rubric, providerStore(test, contextUser));
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

function providerStore(test: MJTestEntity, user: UserInfo): PromoteCriteriaStore {
    return {
        async saveRubric(input) {
            const row = await Metadata.Provider.GetEntityObject<MJTestEntity>('MJ: Rubrics', user);
            row.NewRecord();
            row.Set('Name', input.name);
            row.Set('Description', input.description);
            row.Set('Status', 'Active');
            if (!await row.Save()) throw new Error(row.LatestResult?.Message || 'Could not create the rubric.');
            return String(row.Get('ID'));
        },
        async ensureBinaryScale() {
            const view = new RunView();
            const found = await view.RunView({
                EntityName: 'MJ: Rubric Scales',
                ExtraFilter: `Name='${BINARY_SCALE_NAME.replace(/'/g, "''")}'`,
                ResultType: 'simple',
                MaxRows: 1,
            }, user);
            const existing = found.Results?.[0] as { ID?: string } | undefined;
            if (existing?.ID) return String(existing.ID);
            const scale = await Metadata.Provider.GetEntityObject<MJTestEntity>('MJ: Rubric Scales', user);
            scale.NewRecord();
            scale.Set('Name', BINARY_SCALE_NAME);
            scale.Set('ScaleType', 'Levels');
            scale.Set('HigherIsBetter', true);
            scale.Set('Status', 'Active');
            if (!await scale.Save()) throw new Error(scale.LatestResult?.Message || 'Could not create the binary scale.');
            const scaleId = String(scale.Get('ID'));
            for (const level of [
                { label: 'Not met', value: 0, normalized: 0, sequence: 0 },
                { label: 'Met', value: 1, normalized: 1, sequence: 1 },
            ]) {
                const row = await Metadata.Provider.GetEntityObject<MJTestEntity>('MJ: Rubric Scale Levels', user);
                row.NewRecord();
                row.Set('ScaleID', scaleId);
                row.Set('Label', level.label);
                row.Set('Value', level.value);
                row.Set('NormalizedValue', level.normalized);
                row.Set('Sequence', level.sequence);
                if (!await row.Save()) throw new Error(row.LatestResult?.Message || `Could not save scale level ${level.label}.`);
            }
            return scaleId;
        },
        async saveDraftVersion(input) {
            return saveDraft(input, user);
        },
        async setTestRubric(_testId, rubricId) {
            test.RubricID = rubricId;
            if (!await test.Save()) throw new Error(test.LatestResult?.Message || 'Could not set Test.RubricID.');
        },
    };
}

async function saveDraft(input: PromotedRubric & { rubricId: string; scaleId: string }, user: UserInfo): Promise<string> {
    const version = await Metadata.Provider.GetEntityObject<MJTestEntity>('MJ: Rubric Versions', user);
    version.NewRecord();
    version.Set('RubricID', input.rubricId);
    version.Set('Status', 'Draft');
    version.Set('PassThreshold', input.passThreshold);
    version.Set('NotApplicablePolicy', input.notApplicablePolicy);
    version.Set('ScoreDisplayMin', input.scoreDisplayMin);
    version.Set('ScoreDisplayMax', input.scoreDisplayMax);
    if (!await version.Save()) throw new Error(version.LatestResult?.Message || 'Could not create the draft version.');
    const versionId = String(version.Get('ID'));
    for (const criterion of input.criteria) {
        const row = await Metadata.Provider.GetEntityObject<MJTestEntity>('MJ: Rubric Criteria', user);
        row.NewRecord();
        row.Set('RubricVersionID', versionId);
        row.Set('Key', criterion.key);
        row.Set('Name', criterion.name);
        row.Set('NodeType', 'Criterion');
        row.Set('ScaleID', input.scaleId);
        row.Set('Weight', criterion.weight);
        row.Set('IsAdvisory', false);
        row.Set('IsGate', criterion.isGate);
        row.Set('GateMinimumScore', criterion.gateMinimumScore);
        row.Set('EvidenceRequired', false);
        row.Set('RationaleRequired', false);
        row.Set('Sequence', criterion.sequence);
        if (!await row.Save()) throw new Error(row.LatestResult?.Message || `Could not save criterion ${criterion.key}.`);
    }
    return versionId;
}
