import { Component } from '@angular/core';
import { MJReportVersionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Report Versions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjreportversions-form',
    templateUrl: './mjreportversions.form.component.html'
})
export class MJReportVersionsFormComponent extends BaseFormComponent {
    public record!: MJReportVersionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'reportLinkage', sectionName: 'Report Linkage', isExpanded: true },
            { sectionKey: 'versionDetails', sectionName: 'Version Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

