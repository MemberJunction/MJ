import { Component } from '@angular/core';
import { TaggedItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Tagged Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-taggeditem-form',
    templateUrl: './taggeditem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TaggedItemFormComponent extends BaseFormComponent {
    public record!: TaggedItemEntity;

    // Collapsible section state
    public sectionsExpanded = {
        tagDefinition: true,
        linkedRecord: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadTaggedItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
