import { Component } from '@angular/core';
import { GeneratedCodeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Generated Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-generatedcode-form',
    templateUrl: './generatedcode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GeneratedCodeFormComponent extends BaseFormComponent {
    public record!: GeneratedCodeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadGeneratedCodeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
