import { MJGlobal, RegisterClass } from "@memberjunction/global";
import { Metadata, BaseEntity, BaseInfo, EntityInfo, EntityFieldInfo,RunView, UserInfo, EntitySaveOptions, LogError, ValidationResult } from "@memberjunction/core";
import { DashboardEntity, UserViewEntity } from "../generated/entity_subclasses";


@RegisterClass(BaseEntity, 'Dashboards', 2) // 2 priority so this gets used ahead of the generated sub-class
export class DashboardEntityExtended extends DashboardEntity  {
    override Validate(): ValidationResult {
        console.log("hi");
        return super.Validate();
    }
}