import { Component } from '@angular/core';
import { DuplicateRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Duplicate Run Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-duplicaterundetail-form',
    templateUrl: './duplicaterundetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DuplicateRunDetailFormComponent extends BaseFormComponent {
    public record!: DuplicateRunDetailEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        duplicateRunDetailMatches: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadDuplicateRunDetailFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
