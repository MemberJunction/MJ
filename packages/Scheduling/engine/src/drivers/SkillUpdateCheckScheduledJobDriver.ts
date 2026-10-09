/**
 * @fileoverview Driver for the external-skill update check.
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { LogError, Metadata, RunView, UserInfo, ValidationResult } from '@memberjunction/core';
import { MJAISkillEntity, MJScheduledJobEntity } from '@memberjunction/core-entities';
import { SkillImportExportService } from '@memberjunction/ai-agents';
import { NotificationContent, ScheduledJobResult } from '@memberjunction/scheduling-base-types';

/** Per-run tallies, stored in `ScheduledJobRun.Details`. */
export interface SkillUpdateCheckTally {
    Checked: number;
    MarkedPending: string[];
    Failed: string[];
}

/**
 * Checks every Active skill imported from a URL or GitHub source (`AISkill.SourceType` set) for an
 * upstream change, via {@link SkillImportExportService.CheckSkillForUpdate}: a skill whose upstream
 * content hash no longer matches `SourceContentHash` is set to `Pending` for admin review, never
 * overwritten — upstream instruction text becomes prompt content in agents, so it is reviewed first.
 *
 * Every run decides afresh. An admin accepts a change by re-importing from the source. To keep the
 * current version instead, they pin `SourceRef` to the commit in `SourceURL` (or a tag at it) or clear
 * `SourceType`, then set the skill Active. Setting it Active alone is undone by the next run while an
 * unpinned source still differs, and that is intended.
 *
 * One skill's failure (a 404, a rate limit) is counted and logged, not fatal: the rest still get
 * checked. An instance with no sourced skills costs one empty query per run.
 */
@RegisterClass(BaseScheduledJob, 'SkillUpdateCheckScheduledJobDriver')
export class SkillUpdateCheckScheduledJobDriver extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        try {
            const tally = await this.checkAll(await this.loadSourcedSkills(context.ContextUser), context);
            return { Success: tally.Failed.length === 0, Details: { ...tally } };
        } catch (e) {
            return { Success: false, ErrorMessage: `Skill update check failed: ${e instanceof Error ? e.message : String(e)}` };
        }
    }

    /** Checks each skill in turn, heartbeating the lease as it goes. */
    protected async checkAll(skills: MJAISkillEntity[], context: ScheduledJobExecutionContext): Promise<SkillUpdateCheckTally> {
        const tally: SkillUpdateCheckTally = { Checked: 0, MarkedPending: [], Failed: [] };
        for (const skill of skills) {
            try {
                if (await SkillImportExportService.CheckSkillForUpdate(skill)) {
                    tally.MarkedPending.push(skill.Name);
                }
                tally.Checked++;
            } catch (e) {
                tally.Failed.push(skill.Name);
                LogError(`SkillUpdateCheck: could not check skill '${skill.Name}' (${skill.ID}): ${e instanceof Error ? e.message : String(e)}`);
            }
            void context.heartbeat?.();
        }
        return tally;
    }

    /** Active skills with a recorded source — the only ones that have an upstream to compare against. */
    protected async loadSourcedSkills(user: UserInfo): Promise<MJAISkillEntity[]> {
        const rv = RunView.FromMetadataProvider(Metadata.Provider); // global-provider-ok: scheduled maintenance sweep is a server-global task, not per-request/per-tenant
        const result = await rv.RunView<MJAISkillEntity>({
            EntityName: 'MJ: AI Skills',
            ExtraFilter: `SourceType IS NOT NULL AND Status = 'Active'`,
            ResultType: 'entity_object',
        }, user);
        if (!result.Success) {
            throw new Error(result.ErrorMessage ?? 'could not read sourced skills');
        }
        return result.Results ?? [];
    }

    /** The job takes no configuration. */
    public ValidateConfiguration(_schedule: MJScheduledJobEntity): ValidationResult {
        const result = new ValidationResult();
        result.Success = true;
        return result;
    }

    public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const pending = (result.Details?.['MarkedPending'] as string[] | undefined) ?? [];
        const failed = (result.Details?.['Failed'] as string[] | undefined) ?? [];
        const lines = [
            pending.length > 0 ? `Upstream changed, now Pending review: ${pending.join(', ')}.` : 'No upstream changes.',
            failed.length > 0 ? `Could not check: ${failed.join(', ')}.` : '',
            result.ErrorMessage ?? '',
        ].filter(l => l.length > 0);
        return {
            Subject: pending.length > 0
                ? `Skill update check: ${pending.length} skill(s) need review`
                : `Skill update check: ${context.Schedule.Name}`,
            Body: lines.join('\n'),
            Priority: failed.length > 0 || !result.Success ? 'High' : pending.length > 0 ? 'Normal' : 'Low',
            Metadata: { MarkedPending: pending.length, Failed: failed.length },
        };
    }
}
