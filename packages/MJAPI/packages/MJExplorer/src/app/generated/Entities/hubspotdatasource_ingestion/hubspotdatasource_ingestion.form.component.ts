import { Component } from '@angular/core';
import { hubspotdatasource_ingestionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Datasource Ingestions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdatasource_ingestion-form',
    templateUrl: './hubspotdatasource_ingestion.form.component.html'
})
export class hubspotdatasource_ingestionFormComponent extends BaseFormComponent {
    public record!: hubspotdatasource_ingestionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ingestionDetails', sectionName: 'Ingestion Details', isExpanded: true },
            { sectionKey: 'processingStatus', sectionName: 'Processing Status', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

