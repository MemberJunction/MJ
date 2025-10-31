import { Component } from '@angular/core';
import { ScriptTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadScriptTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Script Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scripttype-form',
    templateUrl: './scripttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScriptTypeFormComponent extends BaseFormComponent {
    public record!: ScriptTypeEntity;
} 

export function LoadScriptTypeFormComponent() {
    LoadScriptTypeDetailsComponent();
}
