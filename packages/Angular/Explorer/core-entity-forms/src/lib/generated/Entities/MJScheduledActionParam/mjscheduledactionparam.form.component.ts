import { Component } from '@angular/core';
import { MJScheduledActionParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Action Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjscheduledactionparam-form',
    templateUrl: './mjscheduledactionparam.form.component.html'
})
export class MJScheduledActionParamFormComponent extends BaseFormComponent {
    public record!: MJScheduledActionParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreIdentifiers', sectionName: 'Core Identifiers', isExpanded: true },
            { sectionKey: 'parameterSettings', sectionName: 'Parameter Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

