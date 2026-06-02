import { Component } from '@angular/core';
import { hubspotsource_codeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Source Codes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotsource_code-form',
    templateUrl: './hubspotsource_code.form.component.html'
})
export class hubspotsource_codeFormComponent extends BaseFormComponent {
    public record!: hubspotsource_codeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'syncAndStatus', sectionName: 'Sync and Status', isExpanded: true },
            { sectionKey: 'contentAndFormat', sectionName: 'Content and Format', isExpanded: true },
            { sectionKey: 'sourceDetails', sectionName: 'Source Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

