import { Component } from '@angular/core';
import { MJActionContextsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Action Contexts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjactioncontexts-form',
    templateUrl: './mjactioncontexts.form.component.html'
})
export class MJActionContextsFormComponent extends BaseFormComponent {
    public record!: MJActionContextsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actionCore', sectionName: 'Action Core', isExpanded: true },
            { sectionKey: 'contextMapping', sectionName: 'Context Mapping', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

