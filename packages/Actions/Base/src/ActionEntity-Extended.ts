import { BaseEntity, CodeNameFromString } from "@memberjunction/core";
import { ActionEntity, ActionLibraryEntity, ActionParamEntity, ActionResultCodeEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { ActionEngineBase } from "./ActionEngine-Base";

@RegisterClass(BaseEntity, 'Actions') // high priority make sure this class is used ahead of other things
export class ActionEntityExtended extends ActionEntity {
    /**
     * Returns true if this action is a core MemberJunction framework action, false otherwise.
     */
    public get IsCoreAction(): boolean {
        return this.Category?.trim().toLowerCase() === ActionEngineBase.Instance.CoreCategoryName.trim().toLowerCase();
    }

    /**
     * Generates a programatically friendly name for the name of the Action.
     */
    public get ProgrammaticName(): string {
        return CodeNameFromString(this.Name);
    }

    private _resultCodes: ActionResultCodeEntity[] = null;
    /**
     * Provides a list of possible result codes for this action.
     */
    public get ResultCodes(): ActionResultCodeEntity[] {
        if (!this._resultCodes) {
            // load the result codes
            this._resultCodes = ActionEngineBase.Instance.ActionResultCodes.filter(c => c.ActionID === this.ID);
        }
        return this._resultCodes;
    }

    private _params: ActionParamEntity[] = null;
    public get Params(): ActionParamEntity[] {
        if (!this._params) {
            // load the inputs
            this._params = ActionEngineBase.Instance.ActionParams.filter(i => i.ActionID === this.ID);
        }
        return this._params;
    }

    private _libs: ActionLibraryEntity[] = null;
    public get Libraries(): ActionLibraryEntity[] {
        if (!this._libs) {
            // load the inputs
            this._libs = ActionEngineBase.Instance.ActionLibraries.filter(l => l.ActionID === this.ID);
        }
        return this._libs;
    }


}
