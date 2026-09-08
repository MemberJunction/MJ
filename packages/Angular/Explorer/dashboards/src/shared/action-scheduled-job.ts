/**
 * Helpers for authoring "run this Action on a schedule" jobs from dashboard surfaces.
 *
 * These replace the retired `MJ: Scheduled Actions` / `MJ: Scheduled Action Params` entities
 * (removed in the v6 Phase 0 legacy retirement). The surviving substrate is a `MJ: Scheduled Jobs`
 * row of type **Action**, executed by `ActionScheduledJobDriver`, which reads the action and its
 * parameters out of the job's `Configuration` JSON rather than from child parameter rows.
 *
 * The Knowledge Hub / AI dashboards (autotagging sources, vector sync, tags) all author the same
 * shape, so the mapping lives here once instead of being triplicated.
 */
import { IMetadataProvider, RunView } from '@memberjunction/core';

/** Name of the `MJ: Scheduled Job Types` row whose driver runs a single Action. */
export const ACTION_JOB_TYPE_NAME = 'Action';

/**
 * One action parameter binding inside an Action job's Configuration.
 * Mirrors `ActionJobConfiguration.Params[]` in `@memberjunction/scheduling-base-types` — restated
 * here rather than imported so the browser bundle takes no dependency on the scheduling engine.
 */
export type ActionJobConfigurationParam = {
    ActionParamID: string;
    ValueType: 'Static' | 'SQL Statement';
    Value: string;
};

/** The `ScheduledJob.Configuration` payload consumed by `ActionScheduledJobDriver`. */
export type ActionJobConfigurationPayload = {
    ActionID: string;
    Params?: ActionJobConfigurationParam[];
};

/**
 * Resolves the ID of the 'Action' scheduled-job type.
 *
 * Looked up by name rather than hardcoded, because job-type IDs are seeded metadata and are not
 * guaranteed to be identical across installs.
 *
 * @returns the job type ID, or null when the type is not present (caller should surface an error)
 */
export async function ResolveActionJobTypeID(provider: IMetadataProvider): Promise<string | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: Scheduled Job Types',
        ExtraFilter: `Name='${ACTION_JOB_TYPE_NAME}'`,
        Fields: ['ID'],
        ResultType: 'simple',
        MaxRows: 1,
    });
    return result.Success && result.Results.length > 0 ? result.Results[0].ID : null;
}

/**
 * Resolves a single named parameter of an action to its `ActionParamID`.
 *
 * @returns the param ID, or null when the action has no parameter by that name
 */
export async function ResolveActionParamID(
    provider: IMetadataProvider,
    actionID: string,
    paramName: string
): Promise<string | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: Action Params',
        ExtraFilter: `ActionID = '${actionID}' AND Name = '${paramName}'`,
        Fields: ['ID'],
        ResultType: 'simple',
        MaxRows: 1,
    });
    return result.Success && result.Results.length > 0 ? result.Results[0].ID : null;
}

/**
 * Builds the serialized `ScheduledJob.Configuration` value for an Action job.
 *
 * Params are omitted entirely when none are supplied, matching the driver's optional `Params`.
 */
export function BuildActionJobConfiguration(
    actionID: string,
    params: ActionJobConfigurationParam[] = []
): string {
    const payload: ActionJobConfigurationPayload = params.length > 0
        ? { ActionID: actionID, Params: params }
        : { ActionID: actionID };
    return JSON.stringify(payload);
}

/**
 * Convenience: build an Action job Configuration carrying exactly one static parameter value.
 *
 * Returns a configuration with no params (and logs a warning) when the named parameter cannot be
 * resolved, so a schedule is still created rather than the whole save failing.
 */
export async function BuildSingleStaticParamConfiguration(
    provider: IMetadataProvider,
    actionID: string,
    paramName: string,
    value: string,
    logPrefix: string
): Promise<string> {
    const actionParamID = await ResolveActionParamID(provider, actionID, paramName);
    if (!actionParamID) {
        console.warn(`${logPrefix} Could not find the '${paramName}' action param; scheduling without parameters.`);
        return BuildActionJobConfiguration(actionID);
    }
    return BuildActionJobConfiguration(actionID, [
        { ActionParamID: actionParamID, ValueType: 'Static', Value: value },
    ]);
}
