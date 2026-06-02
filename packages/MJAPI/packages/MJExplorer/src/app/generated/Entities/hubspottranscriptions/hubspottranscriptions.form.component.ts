import { Component } from '@angular/core';
import { hubspottranscriptionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Transcriptions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspottranscriptions-form',
    templateUrl: './hubspottranscriptions.form.component.html'
})
export class hubspottranscriptionsFormComponent extends BaseFormComponent {
    public record!: hubspottranscriptionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'transcriptionDetails', sectionName: 'Transcription Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

