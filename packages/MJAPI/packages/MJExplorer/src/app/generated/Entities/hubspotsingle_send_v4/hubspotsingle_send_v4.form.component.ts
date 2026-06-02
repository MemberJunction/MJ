import { Component } from '@angular/core';
import { hubspotsingle_send_v4Entity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Single Send V4s') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotsingle_send_v4-form',
    templateUrl: './hubspotsingle_send_v4.form.component.html'
})
export class hubspotsingle_send_v4FormComponent extends BaseFormComponent {
    public record!: hubspotsingle_send_v4Entity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: true },
            { sectionKey: 'emailSendDetails', sectionName: 'Email Send Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

