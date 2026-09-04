import { Component } from '@angular/core';
import { MJCareLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Care Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcarelog-form',
    templateUrl: './mjcarelog.form.component.html'
})
export class MJCareLogFormComponent extends BaseFormComponent {
    public record!: MJCareLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'careDetails', sectionName: 'Care Details', isExpanded: true },
            { sectionKey: 'clinicalDocumentation', sectionName: 'Clinical Documentation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

