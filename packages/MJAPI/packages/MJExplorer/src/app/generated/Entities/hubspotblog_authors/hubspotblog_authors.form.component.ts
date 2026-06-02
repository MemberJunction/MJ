import { Component } from '@angular/core';
import { hubspotblog_authorsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Blog Authors') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotblog_authors-form',
    templateUrl: './hubspotblog_authors.form.component.html'
})
export class hubspotblog_authorsFormComponent extends BaseFormComponent {
    public record!: hubspotblog_authorsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'authorProfile', sectionName: 'Author Profile', isExpanded: true },
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: true },
            { sectionKey: 'contentSettings', sectionName: 'Content Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

