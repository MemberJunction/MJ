import { Component } from '@angular/core';
import { AccountInsightEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Account Insights') // Tell MemberJunction about this class
@Component({
    selector: 'gen-accountinsight-form',
    templateUrl: './accountinsight.form.component.html'
})
export class AccountInsightFormComponent extends BaseFormComponent {
    public record!: AccountInsightEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadAccountInsightFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
