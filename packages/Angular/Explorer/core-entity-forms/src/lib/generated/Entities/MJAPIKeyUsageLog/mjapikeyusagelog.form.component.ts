import { Component } from '@angular/core';
import { MJAPIKeyUsageLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: API Key Usage Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapikeyusagelog-form',
    templateUrl: './mjapikeyusagelog.form.component.html'
})
export class MJAPIKeyUsageLogFormComponent extends BaseFormComponent {
    public record!: MJAPIKeyUsageLogEntity;

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

