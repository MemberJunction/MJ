import { Component } from '@angular/core';
import { EntityActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { EntityActionFormComponent } from '../../generated/Entities/EntityAction/entityaction.form.component';
import { LoadEntityActionDetailsComponent } from '../../generated/Entities/EntityAction/sections/details.component';

@RegisterClass(BaseFormComponent, 'Entity Actions') // Tell MemberJunction about this class
@Component({
    selector: 'mj-custom-entity-action-extended-form',
    templateUrl: './entityaction.form.component.html',
    styleUrls: ['../../../shared/form-styles.css']
})
export class EntityActionExtendedFormComponent extends EntityActionFormComponent {
    public record!: EntityActionEntity;
}

export function LoadEntityActionExtendedFormComponent() {
    LoadEntityActionDetailsComponent();
}
