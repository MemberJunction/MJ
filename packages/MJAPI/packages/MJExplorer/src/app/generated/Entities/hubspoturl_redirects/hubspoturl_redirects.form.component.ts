import { Component } from '@angular/core';
import { hubspoturl_redirectsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Url Redirects') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspoturl_redirects-form',
    templateUrl: './hubspoturl_redirects.form.component.html'
})
export class hubspoturl_redirectsFormComponent extends BaseFormComponent {
    public record!: hubspoturl_redirectsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'matchingLogic', sectionName: 'Matching Logic', isExpanded: true },
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'redirectConfiguration', sectionName: 'Redirect Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

