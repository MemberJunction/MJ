import { Component } from '@angular/core';
import { ListEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Lists') // Tell MemberJunction about this class
@Component({
    selector: 'gen-list-form',
    templateUrl: './list.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ListFormComponent extends BaseFormComponent {
    public record!: ListEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        duplicateRuns: false,
        details1: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadListFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
