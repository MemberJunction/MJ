import type { MJActionExecutionLogEntity } from '@memberjunction/core-entities';

/**
 * Which stored param set the Action Execution Log form displays.
 */
export class ActionExecutionLogParams {
    /**
     * The params JSON to display for a log row. ActionEngine keeps the as-called inputs in `Params` (never
     * overwritten) and writes the final merged set — inputs plus every Output — to `ResultParams` when the run
     * ends, so an ended run shows `ResultParams` (the only column holding its outputs) and a run still in
     * flight shows `Params`. `||`: an empty `ResultParams` holds nothing to show.
     */
    public static DisplayJSON(record: Pick<MJActionExecutionLogEntity, 'Params' | 'ResultParams'>): string | null {
        return record.ResultParams || record.Params || null;
    }
}
