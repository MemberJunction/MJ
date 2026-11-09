/**
 * Builds the data the `Get_Agent_Run_Step_Full_Data` tool exports for one agent run step.
 */
import { ProjectEntityValuesForUser, RecordChangeMetadataSource, UserInfo } from "@memberjunction/core";
import { IndexByUUID } from "@memberjunction/global";
import { MJAIAgentRunStepEntityExtended, ResolvePayloadAtStart, ResolvePayloadAtEnd } from "@memberjunction/ai-core-plus";

/**
 * Every field of `step` the caller may read, with its start and end payloads resolved: a step can
 * store either as a pointer to an earlier step's end, so the export carries the payloads themselves.
 *
 * The result is projected for `user` AFTER the payloads are resolved, so a payload resolved from
 * another step is withheld exactly as the step's own value would be.
 *
 * @param step - The step to export
 * @param steps - Every step of the run, used to resolve payload pointers
 * @param user - The caller the export is for
 * @param metadata - Metadata source for the projection
 */
export function BuildAgentRunStepExportData(
    step: MJAIAgentRunStepEntityExtended,
    steps: MJAIAgentRunStepEntityExtended[],
    user: UserInfo,
    metadata: RecordChangeMetadataSource
): Record<string, unknown> {
    const stepsById = IndexByUUID(steps);
    const data: Record<string, unknown> = {
        // fls-guard: projected by ProjectEntityValuesForUser below
        ...step.GetAll(),
        PayloadAtStart: ResolvePayloadAtStart(step, stepsById),
        PayloadAtEnd: ResolvePayloadAtEnd(step, stepsById),
    };
    return ProjectEntityValuesForUser(metadata, step.EntityInfo, data, user) ?? data;
}
