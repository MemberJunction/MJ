import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { GetDiagramReference } from "@memberjunction/ai-diagrams";

/**
 * Returns authoring reference material for MJ Interactive Diagrams (`workflow`, `lifecycle`,
 * `sequence`, `dataflow`) from `@memberjunction/ai-diagrams`.
 */
@RegisterClass(BaseAction, "__GetArchitectureDiagramReference")
export class GetArchitectureDiagramReferenceAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const diagramType = this.stringParam(params, 'DiagramType');
        const result = GetDiagramReference(diagramType);
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
