import { BaseEntity, CodeNameFromString } from "@memberjunction/core";
import { MJActionEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { ActionEngineBase } from "./ActionEngine-Base";

@RegisterClass(BaseEntity, 'MJ: Actions') // high priority make sure this class is used ahead of other things
export class MJActionEntityExtended extends MJActionEntity {
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

    /*
     * `Params`, `ResultCodes` and `Libraries` used to live here as memoised getters that filtered
     * ActionEngineBase's preloaded caches. They are now generated related-record collections
     * declared on the 'MJ: Actions' EntityRelationship rows — `Source: 'cache'`, `Load: 'lazy'`,
     * read-only — which does exactly the same thing generically: fill on first read, from the same
     * engine cache, with no query.
     *
     * Callers use `action.Params.Items` rather than `action.Params`. The collection is available on
     * BOTH tiers because CodeGen emits it onto the generated base class, whereas these getters only
     * existed wherever this server-side package was loaded.
     */
}
