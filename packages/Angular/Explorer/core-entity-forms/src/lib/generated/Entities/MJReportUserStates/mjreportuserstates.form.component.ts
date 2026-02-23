import { Component } from '@angular/core';
import { MJReportUserStatesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Report User States') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjreportuserstates-form',
    templateUrl: './mjreportuserstates.form.component.html'
})
export class MJReportUserStatesFormComponent extends BaseFormComponent {
    public record!: MJReportUserStatesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recordKeys', sectionName: 'Record Keys', isExpanded: true },
            { sectionKey: 'interactionDetails', sectionName: 'Interaction Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

