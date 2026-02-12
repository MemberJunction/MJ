import { Component } from '@angular/core';
import { OpenAppInstallHistoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Open App Install Histories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-openappinstallhistory-form',
    templateUrl: './openappinstallhistory.form.component.html'
})
export class OpenAppInstallHistoryFormComponent extends BaseFormComponent {
    public record!: OpenAppInstallHistoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'applicationPackage', sectionName: 'Application Package', isExpanded: true },
            { sectionKey: 'installationEvent', sectionName: 'Installation Event', isExpanded: true },
            { sectionKey: 'errorDetails', sectionName: 'Error Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

