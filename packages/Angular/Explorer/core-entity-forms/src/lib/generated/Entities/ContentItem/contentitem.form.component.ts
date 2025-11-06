import { Component } from '@angular/core';
import { ContentItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Content Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentitem-form',
    templateUrl: './contentitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentItemFormComponent extends BaseFormComponent {
    public record!: ContentItemEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        contentItemAttributes: false,
        contentItemTags: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadContentItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
