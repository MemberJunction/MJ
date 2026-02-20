import { RegisterClass } from '@memberjunction/global';
import { BaseEntity } from '@memberjunction/core';
import { MJEntityEntity } from '../generated/entity_subclasses';

/**
 * Extended MJEntityEntity class that provides automatic handling of Description field updates.
 * When a user manually updates the Description, it automatically sets AutoUpdateDescription to 1
 * to prevent CodeGen from overwriting the custom description.
 */
@RegisterClass(BaseEntity, 'MJ: Entities')
export class EntityEntityExtended extends MJEntityEntity {
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
                console.warn(`Setting AutoUpdateDescription to true for Entity "${this.Name}" because Description is being manually updated. This will prevent CodeGen from overwriting this description.`);
                // Set AutoUpdateDescription to true first
                this.AutoUpdateDescription = true;
            }
        }
        
        // Call parent Set method
        super.Set(FieldName, Value);
    }
}