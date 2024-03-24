import { Component } from '@angular/core';
import { EntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entities', 1) // Register with priority of 1, so ABOVE the generated form
@Component({
    selector: 'mj-entities-form',
    templateUrl: './entities-form.component.html',
    styleUrls: ['../../../shared/form-styles.css']
})
export class EntitiesFormComponent extends BaseFormComponent {
    public record!: EntityEntity;
} 
 
export function LoadEntitiesFormComponent() {
    // does nothing, just prevents tree shaking
}