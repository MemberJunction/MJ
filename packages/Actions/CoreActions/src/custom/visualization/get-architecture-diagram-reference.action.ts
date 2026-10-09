import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { GetArchitectureDiagramReference } from "@memberjunction/ai-diagrams";

/**
 * Returns one piece of archify's authoring material: a diagram type's JSON schema, its canonical example,
 * or a reference doc (authoring defaults, the authoring contract, layout repair, brand marks).
 *
 * archify's own skill tells a shell agent to read these files before writing a spec. An MJ agent has no
 * filesystem, so this hands them over on request, which also keeps them out of the skill's instructions.
 */
@RegisterClass(BaseAction, "__GetArchitectureDiagramReference")
export class GetArchitectureDiagramReferenceAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const topic = this.stringParam(params, 'Topic');
        if (!topic) {
            return { Success: false, ResultCode: 'INVALID_INPUT', Message: 'Topic is required.' };
        }
        const result = GetArchitectureDiagramReference(topic.toLowerCase(), this.stringParam(params, 'DiagramType')?.toLowerCase());
        if (result.Success === false) {
            return { Success: false, ResultCode: result.ErrorCode, Message: result.Message };
        }
        return { Success: true, ResultCode: 'SUCCESS', Message: result.Content };
    }

    private stringParam(params: RunActionParams, name: string): string | undefined {
        const value = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase())?.Value;
        const text = value === null || value === undefined ? '' : String(value).trim();
        return text.length > 0 ? text : undefined;
    }
}
