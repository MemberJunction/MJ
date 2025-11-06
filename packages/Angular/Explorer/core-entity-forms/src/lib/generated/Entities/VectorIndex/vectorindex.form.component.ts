import { Component } from '@angular/core';
import { VectorIndexEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Vector Indexes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-vectorindex-form',
    templateUrl: './vectorindex.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class VectorIndexFormComponent extends BaseFormComponent {
    public record!: VectorIndexEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        entityRecordDocuments: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadVectorIndexFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
