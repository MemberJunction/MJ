import { Component } from '@angular/core';
import { ScheduledActionParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Scheduled Action Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-scheduledactionparam-form',
    templateUrl: './scheduledactionparam.form.component.html'
})
export class ScheduledActionParamFormComponent extends BaseFormComponent {
    public record!: ScheduledActionParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreIdentifiers', sectionName: 'Core Identifiers', isExpanded: true },
            { sectionKey: 'parameterSettings', sectionName: 'Parameter Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

