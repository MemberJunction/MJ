import { BaseEntity, CodeNameFromString } from "@memberjunction/core";
import { MJActionEntity, MJActionLibraryEntity, MJActionParamEntity, MJActionResultCodeEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { ActionEngineBase } from "./ActionEngine-Base";

@RegisterClass(BaseEntity, 'MJ: Actions') // high priority make sure this class is used ahead of other things
export class ActionEntityExtended extends MJActionEntity {
    /**
     * Returns true if this action is a core MemberJunction framework action, false otherwise.
     */
    public get IsCoreAction(): boolean {
        return ActionEngineBase.Instance.IsCoreAction(this);
    }

    /**
     * Generates a programatically friendly name for the name of the Action.
     */
    public get ProgrammaticName(): string {
        return CodeNameFromString(this.Name);
    }

    private _resultCodes: MJActionResultCodeEntity[] = null;
    /**
     * Provides a list of possible result codes for this action.
     */
    public get ResultCodes(): MJActionResultCodeEntity[] {
        if (!this._resultCodes) {
            // load the result codes
            this._resultCodes = ActionEngineBase.Instance.ActionResultCodes.filter(c => c.ActionID === this.ID);
        }
        return this._resultCodes;
    }

    private _params: MJActionParamEntity[] = null;
    public get Params(): MJActionParamEntity[] {
        if (!this._params) {
            // load the inputs
            this._params = ActionEngineBase.Instance.ActionParams.filter(i => i.ActionID === this.ID);
        }
        return this._params;
    }

    private _libs: MJActionLibraryEntity[] = null;
    public get Libraries(): MJActionLibraryEntity[] {
        if (!this._libs) {
            // load the inputs
            this._libs = ActionEngineBase.Instance.ActionLibraries.filter(l => l.ActionID === this.ID);
        }
        return this._libs;
    }


}
