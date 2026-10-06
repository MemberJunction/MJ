import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { EscapeSQLString, RegisterClass } from "@memberjunction/global";
import { RunView } from "@memberjunction/core";
import type { MJAISkillFileEntity } from "@memberjunction/core-entities";

/** Strict UUID shape: `Context.ActiveSkillIDs` values are bound into a filter. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SkillFileRow = Pick<MJAISkillFileEntity, 'Path' | 'Content'>;

/**
 * `Read Skill File` — returns one file of a multi-file skill (an `MJ: AI Skill Files` row) by skill
 * name and path. This is the "read a reference on demand" step of progressive disclosure: when a skill
 * with files activates, BaseAgent lists the file paths in the activation message and adds this action
 * to the run, so a file's content enters the context only when the agent asks for it.
 *
 * THE RUN IS THE AUTHORITY, as for Scoped Search: inside an agent run BaseAgent stamps
 * `Context.ActiveSkillIDs`, and only files of skills active in the run are readable — the model
 * cannot read another skill's files by naming it. Outside a run (no ActiveSkillIDs) the read is an
 * ordinary RunView under the caller's entity permissions.
 *
 * Inputs: `Skill` (skill name), `Path` (as listed). Output: `Content`; the content is also the Message.
 * An unknown path fails with `FILE_NOT_FOUND` and lists the skill's paths so the agent can retry.
 */
@RegisterClass(BaseAction, "__ReadSkillFile")
export class ReadSkillFileAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const skill = this.getParam(params, 'skill');
        const path = this.getParam(params, 'path')?.replace(/^\.?\/+/, '');
        if (!skill || !path) {
            return { Success: false, ResultCode: 'MISSING_PARAMETERS', Message: 'Skill and Path are both required' };
        }
        const scope = this.activeSkillFilter(params);
        const skillFilter = `Skill='${EscapeSQLString(skill)}'${scope}`;
        const [file] = await this.readFiles(`${skillFilter} AND Path='${EscapeSQLString(path)}'`, ['Path', 'Content'], params);
        if (!file) {
            const listed = (await this.readFiles(skillFilter, ['Path'], params)).map(r => r.Path).join(', ');
            return {
                Success: false,
                ResultCode: 'FILE_NOT_FOUND',
                Message: listed
                    ? `Skill "${skill}" has no file "${path}". Its files: ${listed}`
                    : `No files found for skill "${skill}"${scope ? ' among the skills active in this run' : ''}`
            };
        }
        params.Params.push({ Name: 'Content', Type: 'Output', Value: file.Content });
        return { Success: true, ResultCode: 'SUCCESS', Message: file.Content };
    }

    /**
     * ` AND SkillID IN (...)` limiting the read to skills active in the calling run, '' outside a run.
     * Inside a run with no active skill the clause matches nothing, which is the correct answer.
     */
    private activeSkillFilter(params: RunActionParams): string {
        const raw = (params.Context as Record<string, unknown> | undefined)?.ActiveSkillIDs;
        if (!Array.isArray(raw)) {
            return '';
        }
        const ids = raw.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v));
        return ids.length > 0 ? ` AND SkillID IN (${ids.map(id => `'${id}'`).join(',')})` : ' AND 1=0';
    }

    /** Skill file rows matching `filter`, narrowed to `fields` (the not-found listing never loads content). */
    private async readFiles(filter: string, fields: (keyof SkillFileRow)[], params: RunActionParams): Promise<SkillFileRow[]> {
        const rv = new RunView(); // global-provider-ok: BaseAction has no bound IMetadataProvider; ContextUser is the per-request scope
        const result = await rv.RunView<SkillFileRow>({
            EntityName: 'MJ: AI Skill Files',
            ExtraFilter: filter,
            Fields: fields,
            OrderBy: 'Path',
            ResultType: 'simple'
        }, params.ContextUser);
        if (!result.Success) {
            throw new Error(`Failed to read skill files: ${result.ErrorMessage}`);
        }
        return result.Results;
    }

    private getParam(params: RunActionParams, name: string): string | undefined {
        const value = params.Params.find(p => p.Name.trim().toLowerCase() === name)?.Value;
        const text = value === undefined || value === null ? '' : String(value).trim();
        return text.length > 0 ? text : undefined;
    }
}
