import { Component } from '@angular/core';
import { EntitySettingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Settings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitysetting-form',
    templateUrl: './entitysetting.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntitySettingFormComponent extends BaseFormComponent {
    public record!: EntitySettingEntity;

    // Collapsible section state
    public sectionsExpanded = {
        entityConfiguration: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntitySettingFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
