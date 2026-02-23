import { Component } from '@angular/core';
import { MJCompanyIntegrationRunAPILogsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Company Integration Run API Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcompanyintegrationrunapilogs-form',
    templateUrl: './mjcompanyintegrationrunapilogs.form.component.html'
})
export class MJCompanyIntegrationRunAPILogsFormComponent extends BaseFormComponent {
    public record!: MJCompanyIntegrationRunAPILogsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'executionTimingStatus', sectionName: 'Execution Timing & Status', isExpanded: true },
            { sectionKey: 'aPICallDetails', sectionName: 'API Call Details', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

