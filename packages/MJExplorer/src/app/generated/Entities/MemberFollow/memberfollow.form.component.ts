import { Component } from '@angular/core';
import { MemberFollowEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Member Follows') // Tell MemberJunction about this class
@Component({
    selector: 'gen-memberfollow-form',
    templateUrl: './memberfollow.form.component.html'
})
export class MemberFollowFormComponent extends BaseFormComponent {
    public record!: MemberFollowEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadMemberFollowFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
