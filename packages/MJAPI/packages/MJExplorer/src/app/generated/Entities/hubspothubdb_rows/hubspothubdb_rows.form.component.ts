import { Component } from '@angular/core';
import { hubspothubdb_rowsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Hubdb Rows') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspothubdb_rows-form',
    templateUrl: './hubspothubdb_rows.form.component.html'
})
export class hubspothubdb_rowsFormComponent extends BaseFormComponent {
    public record!: hubspothubdb_rowsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'rowIdentification', sectionName: 'Row Identification', isExpanded: true },
            { sectionKey: 'rowContent', sectionName: 'Row Content', isExpanded: true },
            { sectionKey: 'tableRelationships', sectionName: 'Table Relationships', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

