import { Component } from '@angular/core';
import { MJContentSourceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJContentSourceFormComponent } from '../../generated/Entities/MJContentSource/mjcontentsource.form.component';

/**
 * Custom Content Source form that conditionally shows/hides Entity-specific fields
 * (EntityID, EntityDocumentID) based on the selected ContentSourceType.
 *
 * When the source type is "Entity", the entity fields are shown and URL is hidden.
 * For all other source types, URL is shown and entity fields are hidden.
 */
@RegisterClass(BaseFormComponent, 'MJ: Content Sources')
@Component({
    standalone: false,
    selector: 'mj-content-source-form-extended',
    templateUrl: './content-source-form.component.html',
})
export class MJContentSourceFormComponentExtended extends MJContentSourceFormComponent {
    public override record!: MJContentSourceEntity;

    /**
     * Whether the current source type is "Entity", which enables
     * EntityID and EntityDocumentID fields and hides the URL field.
     */
    public get IsEntitySourceType(): boolean {
        if (!this.record) return false;
        const typeName = this.record.ContentSourceType;
        return typeName != null && typeName.trim().toLowerCase() === 'entity';
    }
}

export function LoadContentSourceFormExtended() {
    // Prevents tree-shaking
}
