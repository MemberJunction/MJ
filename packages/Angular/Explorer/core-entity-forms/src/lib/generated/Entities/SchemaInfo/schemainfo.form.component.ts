import { Component } from '@angular/core';
import { SchemaInfoEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Schema Info') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-schemainfo-form',
    templateUrl: './schemainfo.form.component.html'
})
export class SchemaInfoFormComponent extends BaseFormComponent {
    public record!: SchemaInfoEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifierRange', sectionName: 'Identifier Range', isExpanded: true },
            { sectionKey: 'schemaInformation', sectionName: 'Schema Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadSchemaInfoFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
