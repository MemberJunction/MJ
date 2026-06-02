import { Component } from '@angular/core';
import { hubspotemailsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Emails') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotemails-form',
    templateUrl: './hubspotemails.form.component.html'
})
export class hubspotemailsFormComponent extends BaseFormComponent {
    public record!: hubspotemailsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'emailContent', sectionName: 'Email Content', isExpanded: true },
            { sectionKey: 'emailMetadata', sectionName: 'Email Metadata', isExpanded: false },
            { sectionKey: 'emailMetrics', sectionName: 'Email Metrics', isExpanded: false },
            { sectionKey: 'participants', sectionName: 'Participants', isExpanded: false },
            { sectionKey: 'emailEngagement', sectionName: 'Email Engagement', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

