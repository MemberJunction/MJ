import { BaseEntity } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { MJEnvironmentEntity } from "../generated/entity_subclasses";

@RegisterClass(BaseEntity, 'MJ: Environments')
export class MJEnvironmentEntityExtended extends MJEnvironmentEntity  {
    /**
     * The default environment ID for MemberJunction. This is the standard environment
     * that is used throughout the system when no specific environment is specified.
     * This value is stable and can be relied upon across all MJ installations.
     *
     * @returns {string} The UUID of the default environment: 'F51358F3-9447-4176-B313-BF8025FD8D09'
     */
    public static get DefaultEnvironmentID(): string {
        return 'F51358F3-9447-4176-B313-BF8025FD8D09';
    }
}
