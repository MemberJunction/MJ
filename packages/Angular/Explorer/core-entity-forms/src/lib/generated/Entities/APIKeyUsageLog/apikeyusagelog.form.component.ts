import { Component } from '@angular/core';
import { APIKeyUsageLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: API Key Usage Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-apikeyusagelog-form',
    templateUrl: './apikeyusagelog.form.component.html'
})
export class APIKeyUsageLogFormComponent extends BaseFormComponent {
    public record!: APIKeyUsageLogEntity;

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

