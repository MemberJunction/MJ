import { Component } from '@angular/core';
import { MJTestSuiteTestsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Suite Tests') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestsuitetests-form',
    templateUrl: './mjtestsuitetests.form.component.html'
})
export class MJTestSuiteTestsFormComponent extends BaseFormComponent {
    public record!: MJTestSuiteTestsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

