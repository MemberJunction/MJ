import { RegisterClass, ValidationErrorInfo, ValidationErrorType, ValidationResult } from "@memberjunction/global";
import { RestaurantEntity } from "../generated/entity_subclasses";
import { BaseEntity, EntitySaveOptions } from "@memberjunction/core";

@RegisterClass(BaseEntity, 'Restaurants')
export class RestaurantEntityExtended extends RestaurantEntity {

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // pre process a save

        const result = await super.Save(options);

        // post process a save

        return result;
    }

    override Validate(): ValidationResult {
        const baseResult = super.Validate();
        if (this.City.trim().toLowerCase() !== 'new orleans') {
            baseResult.Errors.push(new ValidationErrorInfo(
                "City",
                "City must be New Orleans",
                this.City,
                ValidationErrorType.Failure
            ));
            baseResult.Success = false;
        }
        return baseResult;
    }
}

export function antiTreeShaker() {
    // do nothing
}