/**
 * video-generation-cost.checks.ts — the 'video-generation-cost' bundle (VGC1–VGC2, IT136):
 * proves `AIVideoRunner.RunGenerateVideo` end-to-end against live metadata (`Default Generative Video`
 * prompt + `FLUX 3 Video` `Per Second` cost row from VS-GEN-4) using an in-file scripted
 * `BaseVideoGenerator` registered over the bound vendor's `DriverClass`.
 *
 * NO LIVE VENDOR CALLS: every run uses `CredentialScope: 'RuntimeOnly'` with a placeholder key
 * (`it-video-generation-no-network`) and the ClassFactory override restores in Teardown.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ModelUsage } from '@memberjunction/ai';
import { AIVideoRunner } from '@memberjunction/ai-prompts';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { DeleteById, RequireRows } from './agent-live-shared';
import {
    CLIP_DURATION_SECONDS,
    ONE_KB_CLIP,
    RegisterFakeVideoGenerator,
    ScriptedITVideoGenerator,
} from './video-studio-fakes';

const BUNDLE = 'video-generation-cost';
const PLACEHOLDER_API_KEY = 'it-video-generation-no-network';

interface VideoCostFixture {
    ModelID: string;
    VendorID: string;
    DriverClass: string;
    SecondsUsageTypeID: string;
    Driver: ScriptedITVideoGenerator;
    Restore: () => void;
    PromptRunIDs: string[];
}

let videoCostFixture: VideoCostFixture | undefined;

function requireFixture(): VideoCostFixture {
    if (!videoCostFixture) {
        throw new Error(
            `${BUNDLE} fixture not initialized: the bundle lifecycle Setup must run before its checks.`,
        );
    }
    return videoCostFixture;
}

interface PromptRunCostRow {
    ID: string;
    Status: string;
    Success: boolean;
    UsageTypeID: string | null;
    InputUnitsUsed: number | null;
    OutputUnitsUsed: number | null;
    Cost: number | null;
    CostCurrency: string | null;
    TotalCost: number | null;
}

async function readPromptRunCostRow(
    provider: IMetadataProvider,
    user: UserInfo,
    promptRunId: string,
): Promise<PromptRunCostRow> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<PromptRunCostRow>(
        {
            EntityName: 'MJ: AI Prompt Runs',
            ExtraFilter: `ID='${EscapeSQLString(promptRunId)}'`,
            Fields: [
                'ID',
                'Status',
                'Success',
                'UsageTypeID',
                'InputUnitsUsed',
                'OutputUnitsUsed',
                'Cost',
                'CostCurrency',
                'TotalCost',
            ],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const [row] = RequireRows(result, `prompt run ${promptRunId}`);
    Assert(Boolean(row), `Prompt run ${promptRunId} was not found`);
    return row;
}

export const VideoGenerationCostChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.VGC1`,
        Name: 'VGC1: Seconds usage with no driver cost is priced on save from the active Per Second model cost row (VS-GEN-4), readable immediately after RunGenerateVideo returns',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const f = requireFixture();
            const costRow = AIEngineBase.Instance.GetActiveModelCost(
                f.ModelID,
                f.VendorID,
                'Realtime',
                'Seconds',
            );
            Assert(
                Boolean(costRow),
                `No active 'Seconds' cost row found for model ${f.ModelID} / vendor ${f.VendorID} — push VS-GEN-4 metadata before running IT136`,
            );
            const calculator = AIEngineBase.Instance.GetPriceCalculator(costRow!);
            Assert(
                Boolean(calculator),
                `No price calculator resolved for cost row ${costRow!.ID} (VS-GEN-4 Per Second unit)`,
            );
            const expectedCost = calculator!.CalculateCost(costRow!, {
                input: 0,
                output: CLIP_DURATION_SECONDS,
            });
            Assert(expectedCost > 0, `Expected positive calculated cost from VS-GEN-4 row, got ${expectedCost}`);

            f.Driver.Arm({
                JobID: 'it136-job-vgc1',
                Usage: ModelUsage.ForMedia('Seconds', 0, CLIP_DURATION_SECONDS),
            });

            const runner = new AIVideoRunner();
            runner.Provider = ctx.Provider;
            const result = await runner.RunGenerateVideo({
                Prompt: 'IT136 VGC1 server-calculated Per Second cost check',
                Mode: 'TextToVideo',
                DurationSeconds: CLIP_DURATION_SECONDS,
                AspectRatio: '16:9',
                Quality: 'standard',
                PollIntervalMS: 0,
                APIKeys: [{ driverClass: f.DriverClass, apiKey: PLACEHOLDER_API_KEY }],
                CredentialScope: 'RuntimeOnly',
                ContextUser: ctx.User,
            });

            if (result.PromptRunID) {
                f.PromptRunIDs.push(result.PromptRunID);
            }

            AssertEqual(result.Success, true, `RunGenerateVideo failed: ${result.ErrorMessage ?? 'unknown'}`);
            Assert(Boolean(result.PromptRunID), 'RunGenerateVideo must return a PromptRunID');
            AssertEqual(result.Video?.Data.byteLength, ONE_KB_CLIP.byteLength, 'Resolved clip should be 1 KB');
            AssertEqual(result.Cost, undefined, 'Driver reported no cost so result.Cost is undefined');

            // Read right after RunGenerateVideo returns (no settle wait: RunGenerateVideo flushed the save)
            const saved = await readPromptRunCostRow(ctx.Provider, ctx.User, result.PromptRunID!);
            AssertEqual(saved.Status, 'Completed', 'Saved prompt run should already be Completed');
            Assert(
                UUIDsEqual(saved.UsageTypeID, f.SecondsUsageTypeID),
                `Expected Seconds UsageTypeID (${f.SecondsUsageTypeID}), got ${saved.UsageTypeID}`,
            );
            AssertEqual(Number(saved.OutputUnitsUsed), CLIP_DURATION_SECONDS, 'OutputUnitsUsed should equal clip duration');
            Assert(
                Math.abs(Number(saved.Cost) - expectedCost) < 1e-6,
                `Expected saved Cost to equal Per Second calculated cost ${expectedCost}, got ${saved.Cost}`,
            );
        },
    },
    {
        Id: `${BUNDLE}.VGC2`,
        Name: 'VGC2: Driver-reported cost (1.23 USD) is preserved on the saved prompt run row without server recomputation and returned on result.Cost',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const f = requireFixture();
            const driverUsage = ModelUsage.ForMedia('Seconds', 0, CLIP_DURATION_SECONDS);
            driverUsage.cost = 1.23;
            driverUsage.costCurrency = 'USD';

            f.Driver.Arm({
                JobID: 'it136-job-vgc2',
                Usage: driverUsage,
            });

            const runner = new AIVideoRunner();
            runner.Provider = ctx.Provider;
            const result = await runner.RunGenerateVideo({
                Prompt: 'IT136 VGC2 driver-reported cost preservation check',
                Mode: 'TextToVideo',
                DurationSeconds: CLIP_DURATION_SECONDS,
                AspectRatio: '16:9',
                Quality: 'standard',
                PollIntervalMS: 0,
                APIKeys: [{ driverClass: f.DriverClass, apiKey: PLACEHOLDER_API_KEY }],
                CredentialScope: 'RuntimeOnly',
                ContextUser: ctx.User,
            });

            if (result.PromptRunID) {
                f.PromptRunIDs.push(result.PromptRunID);
            }

            AssertEqual(result.Success, true, `RunGenerateVideo failed: ${result.ErrorMessage ?? 'unknown'}`);
            Assert(Boolean(result.PromptRunID), 'RunGenerateVideo must return a PromptRunID');
            AssertEqual(result.Cost, 1.23, 'result.Cost should reflect the driver-reported cost');
            AssertEqual(result.CostCurrency, 'USD', 'result.CostCurrency should reflect USD');

            const saved = await readPromptRunCostRow(ctx.Provider, ctx.User, result.PromptRunID!);
            AssertEqual(saved.Status, 'Completed', 'Saved prompt run should already be Completed');
            Assert(
                Math.abs(Number(saved.Cost) - 1.23) < 1e-6,
                `Expected saved Cost to preserve driver-reported 1.23 without recomputation, got ${saved.Cost}`,
            );
            AssertEqual(saved.CostCurrency, 'USD', 'Saved CostCurrency should be USD');
        },
    },
];

for (const check of VideoGenerationCostChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        await AIEngine.Instance.Config(false, ctx.User);
        await AIEngineBase.Instance.Config(false, ctx.User);

        const prompt = AIEngine.Instance.Prompts.find(
            p => p.Name?.trim() === AIVideoRunner.GENERATIVE_PROMPT_NAME,
        );
        if (!prompt) {
            throw new Error(
                `Prompt '${AIVideoRunner.GENERATIVE_PROMPT_NAME}' is not in this database. Seed it: mj sync push --dir=metadata --include="prompts"`,
            );
        }

        const bindings = AIEngine.Instance.PromptModels.filter(pm =>
            UUIDsEqual(pm.PromptID, prompt.ID),
        ).sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));
        const binding = bindings[0];
        if (!binding) {
            throw new Error(
                `Prompt '${AIVideoRunner.GENERATIVE_PROMPT_NAME}' has no bound MJ: AI Prompt Models rows.`,
            );
        }

        const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, binding.ModelID));
        if (!model) {
            throw new Error(
                `Bound model ${binding.ModelID} for '${AIVideoRunner.GENERATIVE_PROMPT_NAME}' was not found (ensure VS-GEN-4 metadata is pushed).`,
            );
        }

        const inferenceVendors = AIEngine.Instance.ModelVendors.filter(
            mv =>
                UUIDsEqual(mv.ModelID, model.ID) &&
                AIEngine.Instance.IsInferenceProvider(mv) &&
                mv.Status === 'Active',
        ).sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));

        const modelVendor = binding.VendorID
            ? inferenceVendors.find(mv => UUIDsEqual(mv.VendorID, binding.VendorID)) ??
              inferenceVendors[0]
            : inferenceVendors[0];

        if (!modelVendor || !modelVendor.DriverClass || !modelVendor.VendorID) {
            throw new Error(
                `Model '${model.Name}' has no active inference vendor with a DriverClass (ensure VS-GEN-4 metadata is pushed).`,
            );
        }

        const secondsUsageType = AIEngineBase.Instance.UsageTypes.find(u => u.Name === 'Seconds');
        if (!secondsUsageType) {
            throw new Error(`'Seconds' usage type not found in AIEngineBase.Instance.UsageTypes.`);
        }

        const fakeVideo = RegisterFakeVideoGenerator(undefined, modelVendor.DriverClass);

        videoCostFixture = {
            ModelID: model.ID,
            VendorID: modelVendor.VendorID,
            DriverClass: modelVendor.DriverClass,
            SecondsUsageTypeID: secondsUsageType.ID,
            Driver: fakeVideo.Driver,
            Restore: fakeVideo.restore,
            PromptRunIDs: [],
        };
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const f = videoCostFixture;
        videoCostFixture = undefined;
        if (!f) {
            return;
        }
        f.Restore();
        for (const id of f.PromptRunIDs) {
            await DeleteById('MJ: AI Prompt Runs', id, ctx.Provider, ctx.User).catch(err =>
                console.error(`[${BUNDLE}] cleanup of prompt run ${id} failed:`, err),
            );
        }
    },
});
