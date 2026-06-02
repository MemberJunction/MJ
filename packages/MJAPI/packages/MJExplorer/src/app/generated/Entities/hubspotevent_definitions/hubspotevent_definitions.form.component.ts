import { Component } from '@angular/core';
import { hubspotevent_definitionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Definitions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotevent_definitions-form',
    templateUrl: './hubspotevent_definitions.form.component.html'
})
export class hubspotevent_definitionsFormComponent extends BaseFormComponent {
    public record!: hubspotevent_definitionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'eventIdentification', sectionName: 'Event Identification', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

