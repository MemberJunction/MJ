import { Component } from '@angular/core';
import { SchemaInfoEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Schema Info') // Tell MemberJunction about this class
@Component({
    selector: 'gen-schemainfo-form',
    templateUrl: './schemainfo.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SchemaInfoFormComponent extends BaseFormComponent {
    public record!: SchemaInfoEntity;

    // Collapsible section state
    public sectionsExpanded = {
        identifierRange: true,
        schemaInformation: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadSchemaInfoFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
