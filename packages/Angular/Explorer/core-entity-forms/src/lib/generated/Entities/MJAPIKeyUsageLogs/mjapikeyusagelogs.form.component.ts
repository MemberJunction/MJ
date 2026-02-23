import { Component } from '@angular/core';
import { MJAPIKeyUsageLogsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: API Key Usage Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapikeyusagelogs-form',
    templateUrl: './mjapikeyusagelogs.form.component.html'
})
export class MJAPIKeyUsageLogsFormComponent extends BaseFormComponent {
    public record!: MJAPIKeyUsageLogsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'requestInformation', sectionName: 'Request Information', isExpanded: true },
            { sectionKey: 'responseClientInfo', sectionName: 'Response & Client Info', isExpanded: true },
            { sectionKey: 'authorizationDetails', sectionName: 'Authorization Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

