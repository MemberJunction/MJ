import { Component } from '@angular/core';
import { ComponentRegistryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Component Registries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-componentregistry-form',
    templateUrl: './componentregistry.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ComponentRegistryFormComponent extends BaseFormComponent {
    public record!: ComponentRegistryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        mJComponents: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadComponentRegistryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
