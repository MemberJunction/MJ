import { Component } from '@angular/core';
import { MJScheduledActionParamsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Action Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjscheduledactionparams-form',
    templateUrl: './mjscheduledactionparams.form.component.html'
})
export class MJScheduledActionParamsFormComponent extends BaseFormComponent {
    public record!: MJScheduledActionParamsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreIdentifiers', sectionName: 'Core Identifiers', isExpanded: true },
            { sectionKey: 'parameterSettings', sectionName: 'Parameter Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

