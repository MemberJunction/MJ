import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { GraphEngine, MJGraphEdgeTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

/**
 * Server-side subclass for `MJ: Graph Edge Types` enforcing case-insensitive `(GraphID, Name)`
 * uniqueness across both global (`GraphID IS NULL`) and graph-scoped (`GraphID IS NOT NULL`)
 * edge types.
 */
@RegisterClass(BaseEntity, 'MJ: Graph Edge Types')
export class MJGraphEdgeTypeEntityServer extends MJGraphEdgeTypeEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateUniqueScopeAndName(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    private validateUniqueScopeAndName(result: ValidationResult): void {
        const trimmedName = this.Name?.trim().toLowerCase();
        if (!trimmedName) {
            return;
        }

        const myGraphID = this.GraphID?.trim() || null;
        const duplicate = GraphEngine.Instance.EdgeTypes.find(et => {
            if (this.ID && UUIDsEqual(et.ID, this.ID)) {
                return false;
            }
            if ((et.Name ?? '').trim().toLowerCase() !== trimmedName) {
                return false;
            }
            const otherGraphID = et.GraphID?.trim() || null;
            if (myGraphID === null && otherGraphID === null) {
                return true;
            }
            if (myGraphID !== null && otherGraphID !== null) {
                return UUIDsEqual(myGraphID, otherGraphID);
            }
            return false;
        });

        if (duplicate) {
            const scopeDesc = myGraphID ? `graph '${myGraphID}'` : 'global scope (GraphID IS NULL)';
            result.Errors.push(
                new ValidationErrorInfo(
                    'Name',
                    `A Graph Edge Type named '${this.Name.trim()}' already exists in ${scopeDesc}.`,
                    this.Name,
                    ValidationErrorType.Failure,
                ),
            );
        }
    }
}
