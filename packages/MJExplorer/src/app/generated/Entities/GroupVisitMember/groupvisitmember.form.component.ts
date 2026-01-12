import { Component } from '@angular/core';
import { GroupVisitMemberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Group Visit Members') // Tell MemberJunction about this class
@Component({
    selector: 'gen-groupvisitmember-form',
    templateUrl: './groupvisitmember.form.component.html'
})
export class GroupVisitMemberFormComponent extends BaseFormComponent {
    public record!: GroupVisitMemberEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'participantDetails', sectionName: 'Participant Details', isExpanded: true },
            { sectionKey: 'paymentInformation', sectionName: 'Payment Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadGroupVisitMemberFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
