import { Component } from '@angular/core';
import { hubspothubdb_tablesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Hubdb Tables') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspothubdb_tables-form',
    templateUrl: './hubspothubdb_tables.form.component.html'
})
export class hubspothubdb_tablesFormComponent extends BaseFormComponent {
    public record!: hubspothubdb_tablesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'auditInformation', sectionName: 'Audit Information', isExpanded: true },
            { sectionKey: 'tableStatistics', sectionName: 'Table Statistics', isExpanded: true },
            { sectionKey: 'tableConfiguration', sectionName: 'Table Configuration', isExpanded: false },
            { sectionKey: 'publishingAndAccess', sectionName: 'Publishing and Access', isExpanded: false },
            { sectionKey: 'cMSSettings', sectionName: 'CMS Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

