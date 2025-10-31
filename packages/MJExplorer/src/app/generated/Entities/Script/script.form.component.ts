import { Component } from '@angular/core';
import { ScriptEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadScriptDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Scripts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-script-form',
    templateUrl: './script.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScriptFormComponent extends BaseFormComponent {
    public record!: ScriptEntity;
} 

export function LoadScriptFormComponent() {
    LoadScriptDetailsComponent();
}
