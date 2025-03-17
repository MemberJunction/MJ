import { Component } from '@angular/core';
import { GeneratedCodeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGeneratedCodeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Generated Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-generatedcode-form',
    templateUrl: './generatedcode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GeneratedCodeFormComponent extends BaseFormComponent {
    public record!: GeneratedCodeEntity;
} 

export function LoadGeneratedCodeFormComponent() {
    LoadGeneratedCodeDetailsComponent();
}
