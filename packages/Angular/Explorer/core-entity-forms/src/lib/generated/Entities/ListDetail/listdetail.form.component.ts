import { Component } from '@angular/core';
import { ListDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'List Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-listdetail-form',
    templateUrl: './listdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ListDetailFormComponent extends BaseFormComponent {
    public record!: ListDetailEntity;

    // Collapsible section state
    public sectionsExpanded = {
        listReference: true,
        detailAttributes: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadListDetailFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
