import { Component } from '@angular/core';
import { mjintegrationSchemaHistoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Schema Histories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjintegrationschemahistory-form',
    templateUrl: './mjintegrationschemahistory.form.component.html'
})
export class mjintegrationSchemaHistoryFormComponent extends BaseFormComponent {
    public record!: mjintegrationSchemaHistoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'schemaChangeContext', sectionName: 'Schema Change Context', isExpanded: true },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

