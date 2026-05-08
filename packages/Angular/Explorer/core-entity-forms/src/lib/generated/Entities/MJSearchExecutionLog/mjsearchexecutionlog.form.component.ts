import { Component } from '@angular/core';
import { MJSearchExecutionLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Search Execution Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsearchexecutionlog-form',
    templateUrl: './mjsearchexecutionlog.form.component.html'
})
export class MJSearchExecutionLogFormComponent extends BaseFormComponent {
    public record!: MJSearchExecutionLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

