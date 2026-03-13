import { Component } from '@angular/core';
import { MJTestSuiteTestEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Suite Tests') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestsuitetest-form',
    templateUrl: './mjtestsuitetest.form.component.html'
})
export class MJTestSuiteTestFormComponent extends BaseFormComponent {
    public record!: MJTestSuiteTestEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

