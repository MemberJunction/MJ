import { Component } from '@angular/core';
import { VectorDatabaseEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Vector Databases') // Tell MemberJunction about this class
@Component({
    selector: 'gen-vectordatabase-form',
    templateUrl: './vectordatabase.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class VectorDatabaseFormComponent extends BaseFormComponent {
    public record!: VectorDatabaseEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        entityDocuments: false,
        vectorIndexes: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadVectorDatabaseFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
