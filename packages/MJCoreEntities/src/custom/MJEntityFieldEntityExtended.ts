import { RegisterClass } from '@memberjunction/global';
import { BaseEntity, ValidationResult, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import { MJEntityFieldEntity } from '../generated/entity_subclasses';

/**
 * Extended MJEntityFieldEntity class that provides safeguards against modifying database-reflected properties.
 * These properties should only be updated by the CodeGen system when reflecting changes from the database schema.
 */
@RegisterClass(BaseEntity, 'MJ: Entity Fields')
export class EntityFieldEntityExtended extends MJEntityFieldEntity {
    /**
     * Properties that are reflected from the database schema and should not be modified directly
     */
    private static readonly DATABASE_REFLECTED_PROPERTIES = [
        'Name',              // Column name in database
        'Type',              // SQL data type
        'Length',            // Column length
        'Precision',         // Numeric precision
        'Scale',             // Numeric scale
        'IsPrimaryKey',      // Primary key status
        'IsUnique',          // Unique constraint status
        'AllowsNull',        // Nullable status
        'IsVirtual',         // Whether field exists in database
        'DefaultValue',      // Default value from database
        'AutoIncrement',     // Auto-increment status
        'RelatedEntityID',   // Foreign key relationships
        'RelatedEntityFieldName' // Foreign key field reference
    ];

    /**
     * Override Set to handle Description field changes
     */
    public override Set(FieldName: string, Value: any): void {
        // Handle Description field changes
        if (FieldName.toLowerCase() === 'description' && !this.NewRecord) {
            const currentDescription = this.GetFieldByName('Description')?.Value;
            const autoUpdateDescription = this.GetFieldByName('AutoUpdateDescription')?.Value;
            
            // If description is changing and AutoUpdateDescription is not already true
            if (Value !== currentDescription && autoUpdateDescription !== true) {
                console.warn(`Setting AutoUpdateDescription to true for Entity Field "${this.Name}" because Description is being manually updated. This will prevent CodeGen from overwriting this description.`);
                // Set AutoUpdateDescription to true first
                this.AutoUpdateDescription = true;
            }
        }
        
        // Call parent Set method
        super.Set(FieldName, Value);
    }

    /**
     * Validates the entity field before saving. Extends the base validation to prevent modifications
     * to database-reflected properties.
     */
    public override Validate(): ValidationResult {
        // First run the base validation
        const result = super.Validate();
        
        // If we're updating an existing record, check for restricted field modifications
        if (!this.NewRecord) {
            // Check each database-reflected property
            for (const prop of EntityFieldEntityExtended.DATABASE_REFLECTED_PROPERTIES) {
                const field = this.GetFieldByName(prop);
                if (field && field.Dirty) {
                    result.Success = false;
                    result.Errors.push(new ValidationErrorInfo(
                        prop,
                        `Cannot modify ${prop} - this property is reflected from the database schema and can only be updated by CodeGen`,
                        field.Value,
                        ValidationErrorType.Failure
                    ));
                }
            }
        }
        
        return result;
    }
}