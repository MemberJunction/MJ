import { Component } from '@angular/core';
import { ErrorLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Error Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-errorlog-form',
    templateUrl: './errorlog.form.component.html'
})
export class ErrorLogFormComponent extends BaseFormComponent {
    public record!: ErrorLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalInformation', sectionName: 'Technical Information', isExpanded: true },
            { sectionKey: 'errorClassification', sectionName: 'Error Classification', isExpanded: true },
            { sectionKey: 'errorContent', sectionName: 'Error Content', isExpanded: false },
            { sectionKey: 'integrationContext', sectionName: 'Integration Context', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

