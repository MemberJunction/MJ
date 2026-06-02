import { Component } from '@angular/core';
import { hubspottimeline_event_templatesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Timeline Event Templates') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspottimeline_event_templates-form',
    templateUrl: './hubspottimeline_event_templates.form.component.html'
})
export class hubspottimeline_event_templatesFormComponent extends BaseFormComponent {
    public record!: hubspottimeline_event_templatesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'templateInformation', sectionName: 'Template Information', isExpanded: true },
            { sectionKey: 'templateConfiguration', sectionName: 'Template Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

