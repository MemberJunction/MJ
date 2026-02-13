import { Component } from '@angular/core';
import { MJErrorLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Error Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjerrorlog-form',
    templateUrl: './mjerrorlog.form.component.html'
})
export class MJErrorLogFormComponent extends BaseFormComponent {
    public record!: MJErrorLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalInformation', sectionName: 'Technical Information', isExpanded: true },
            { sectionKey: 'errorClassification', sectionName: 'Error Classification', isExpanded: true },
            { sectionKey: 'errorContent', sectionName: 'Error Content', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

