import { Component } from '@angular/core';
import { TestSuiteTestEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Suite Tests') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-testsuitetest-form',
    templateUrl: './testsuitetest.form.component.html'
})
export class TestSuiteTestFormComponent extends BaseFormComponent {
    public record!: TestSuiteTestEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

