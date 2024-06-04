import { Component } from '@angular/core';
import { EntitySettingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntitySettingDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Settings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitysetting-form',
    templateUrl: './entitysetting.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntitySettingFormComponent extends BaseFormComponent {
    public record!: EntitySettingEntity;
} 

export function LoadEntitySettingFormComponent() {
    LoadEntitySettingDetailsComponent();
}
