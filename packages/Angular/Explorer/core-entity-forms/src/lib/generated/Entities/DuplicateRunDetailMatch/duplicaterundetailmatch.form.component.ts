import { Component } from '@angular/core';
import { DuplicateRunDetailMatchEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Duplicate Run Detail Matches') // Tell MemberJunction about this class
@Component({
    selector: 'gen-duplicaterundetailmatch-form',
    templateUrl: './duplicaterundetailmatch.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DuplicateRunDetailMatchFormComponent extends BaseFormComponent {
    public record!: DuplicateRunDetailMatchEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadDuplicateRunDetailMatchFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
