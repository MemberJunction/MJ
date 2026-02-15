import { Component } from '@angular/core';
import { MJReportUserStateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Report User States') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjreportuserstate-form',
    templateUrl: './mjreportuserstate.form.component.html'
})
export class MJReportUserStateFormComponent extends BaseFormComponent {
    public record!: MJReportUserStateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recordKeys', sectionName: 'Record Keys', isExpanded: true },
            { sectionKey: 'interactionDetails', sectionName: 'Interaction Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

