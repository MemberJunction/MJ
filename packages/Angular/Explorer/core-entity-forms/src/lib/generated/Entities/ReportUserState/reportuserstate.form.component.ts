import { Component } from '@angular/core';
import { ReportUserStateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Report User States') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-reportuserstate-form',
    templateUrl: './reportuserstate.form.component.html'
})
export class ReportUserStateFormComponent extends BaseFormComponent {
    public record!: ReportUserStateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recordKeys', sectionName: 'Record Keys', isExpanded: true },
            { sectionKey: 'interactionDetails', sectionName: 'Interaction Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadReportUserStateFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
