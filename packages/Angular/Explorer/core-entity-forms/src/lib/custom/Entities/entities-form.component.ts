import { Component } from '@angular/core';
import { EntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { EntityFormComponent } from '../../generated/Entities/Entity/entity.form.component';

@RegisterClass(BaseFormComponent, 'Entities') 
@Component({
    selector: 'mj-entities-form',
    templateUrl: './entities-form.component.html',
    styleUrls: ['../../../shared/form-styles.css']
})
export class CustomEntityFormComponent extends EntityFormComponent {
    public record!: EntityEntity;
} 
 
export function LoadEntitiesFormComponent() {
    // does nothing, just prevents tree shaking
}