import { Component } from '@angular/core';
import { ExplorerNavigationItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Explorer Navigation Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-explorernavigationitem-form',
    templateUrl: './explorernavigationitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ExplorerNavigationItemFormComponent extends BaseFormComponent {
    public record!: ExplorerNavigationItemEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadExplorerNavigationItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
