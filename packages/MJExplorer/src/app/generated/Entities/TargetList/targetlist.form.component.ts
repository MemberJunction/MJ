import { Component } from '@angular/core';
import { TargetListEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTargetListDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Target Lists') // Tell MemberJunction about this class
@Component({
    selector: 'gen-targetlist-form',
    templateUrl: './targetlist.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TargetListFormComponent extends BaseFormComponent {
    public record!: TargetListEntity;
} 

export function LoadTargetListFormComponent() {
    LoadTargetListDetailsComponent();
}
