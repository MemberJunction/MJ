import { RegisterClass } from '@memberjunction/global';
import { BaseEntity } from '@memberjunction/core';
import { MJEntityEntity } from '../generated/entity_subclasses';

/**
 * Extended MJEntityEntity class that provides automatic handling of Description field updates.
 * When a user manually updates the Description, it automatically sets AutoUpdateDescription to 1
 * to prevent CodeGen from overwriting the custom description.
 */
@RegisterClass(BaseEntity, 'MJ: Entities')
export class MJEntityEntityExtended extends MJEntityEntity {
    /**
     * Override Set to handle Description field changes
     */
    public override Set(FieldName: string, Value: any): void {
        // Handle Description field changes
        if (FieldName.toLowerCase() === 'description' && !this.NewRecord) {
            const currentDescription = this.GetFieldByName('Description')?.Value;
            const autoUpdateDescription = this.GetFieldByName('AutoUpdateDescription')?.Value;
            
            // If description is changing and AutoUpdateDescription is not already false
            if (Value !== currentDescription && autoUpdateDescription !== false) {
                console.warn(`Setting AutoUpdateDescription to false for Entity "${this.Name}" because Description is being manually updated. This will prevent CodeGen from overwriting this description.`);
                // Set AutoUpdateDescription to false
                this.AutoUpdateDescription = false;
            }
        }
        
        // Call parent Set method
        super.Set(FieldName, Value);
    }
}