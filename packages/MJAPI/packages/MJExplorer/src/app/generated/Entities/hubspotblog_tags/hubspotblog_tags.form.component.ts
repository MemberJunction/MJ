import { Component } from '@angular/core';
import { hubspotblog_tagsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Blog Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotblog_tags-form',
    templateUrl: './hubspotblog_tags.form.component.html'
})
export class hubspotblog_tagsFormComponent extends BaseFormComponent {
    public record!: hubspotblog_tagsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagInformation', sectionName: 'Tag Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

