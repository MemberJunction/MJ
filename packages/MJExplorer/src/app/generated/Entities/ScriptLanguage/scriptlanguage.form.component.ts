import { Component } from '@angular/core';
import { ScriptLanguageEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadScriptLanguageDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Script Languages') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scriptlanguage-form',
    templateUrl: './scriptlanguage.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScriptLanguageFormComponent extends BaseFormComponent {
    public record!: ScriptLanguageEntity;
} 

export function LoadScriptLanguageFormComponent() {
    LoadScriptLanguageDetailsComponent();
}
