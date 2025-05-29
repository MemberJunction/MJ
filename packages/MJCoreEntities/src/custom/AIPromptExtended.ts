import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from "@memberjunction/core";
import { AIPromptEntity } from "../generated/entity_subclasses";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseEntity, "AI Prompts")
export class AIPromptEntityExtended extends AIPromptEntity {
    /**
     * Fix bug in generated code where new records have a null ID and that matches
     * the ResultSelectorPromptID, which causes a validation error. When that code 
     * gets regenerated we can remove this override.
     * @param result 
     */
    override ValidateResultSelectorPromptIDNotEqualID(result: ValidationResult) {
        if (this.ResultSelectorPromptID === this.ID && this.ID /*make sure ID !== null*/) {
            result.Errors.push(new ValidationErrorInfo("ResultSelectorPromptID", "The ResultSelectorPromptID cannot be the same as the ID. A result selector prompt cannot reference itself.", this.ResultSelectorPromptID, ValidationErrorType.Failure));
        }
    }
    
}