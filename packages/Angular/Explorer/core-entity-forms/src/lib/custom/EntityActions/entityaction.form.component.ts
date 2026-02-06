import { Component } from '@angular/core';
import { EntityActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { EntityActionFormComponent } from '../../generated/Entities/EntityAction/entityaction.form.component';

@RegisterClass(BaseFormComponent, 'Entity Actions') // Tell MemberJunction about this class
@Component({
  standalone: false,
    selector: 'mj-custom-entity-action-extended-form',
    templateUrl: './entityaction.form.component.html',
    styleUrls: ['../../../shared/form-styles.css']
})
export class EntityActionExtendedFormComponent extends EntityActionFormComponent {
    public record!: EntityActionEntity;
}

export function LoadEntityActionExtendedFormComponent() {
}
