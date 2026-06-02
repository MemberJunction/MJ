import { Component } from '@angular/core';
import { hubspotblog_settingsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Blog Settings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotblog_settings-form',
    templateUrl: './hubspotblog_settings.form.component.html'
})
export class hubspotblog_settingsFormComponent extends BaseFormComponent {
    public record!: hubspotblog_settingsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'blogConfiguration', sectionName: 'Blog Configuration', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: true },
            { sectionKey: 'securityAndAccess', sectionName: 'Security and Access', isExpanded: false },
            { sectionKey: 'sEOAndMetadata', sectionName: 'SEO and Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

