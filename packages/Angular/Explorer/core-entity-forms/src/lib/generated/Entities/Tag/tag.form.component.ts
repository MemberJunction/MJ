import { Component } from '@angular/core';
import { TagEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Tags') // Tell MemberJunction about this class
@Component({
    selector: 'gen-tag-form',
    templateUrl: './tag.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TagFormComponent extends BaseFormComponent {
    public record!: TagEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        taggedItems: false,
        tags: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadTagFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
