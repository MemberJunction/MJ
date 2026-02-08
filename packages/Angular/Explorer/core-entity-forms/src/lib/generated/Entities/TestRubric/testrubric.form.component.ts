import { Component } from '@angular/core';
import { TestRubricEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Rubrics') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-testrubric-form',
    templateUrl: './testrubric.form.component.html'
})
export class TestRubricFormComponent extends BaseFormComponent {
    public record!: TestRubricEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

