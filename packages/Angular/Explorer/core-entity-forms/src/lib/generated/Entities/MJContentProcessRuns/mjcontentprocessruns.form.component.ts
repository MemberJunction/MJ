import { Component } from '@angular/core';
import { MJContentProcessRunsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Process Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentprocessruns-form',
    templateUrl: './mjcontentprocessruns.form.component.html'
})
export class MJContentProcessRunsFormComponent extends BaseFormComponent {
    public record!: MJContentProcessRunsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'runMetadata', sectionName: 'Run Metadata', isExpanded: false }
        ]);
    }
}

