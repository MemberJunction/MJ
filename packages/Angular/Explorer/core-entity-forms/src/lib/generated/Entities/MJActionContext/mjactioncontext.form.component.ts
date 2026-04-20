import { Component } from '@angular/core';
import { MJActionContextEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Action Contexts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjactioncontext-form',
    templateUrl: './mjactioncontext.form.component.html'
})
export class MJActionContextFormComponent extends BaseFormComponent {
    public record!: MJActionContextEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actionCore', sectionName: 'Action Core', isExpanded: true },
            { sectionKey: 'contextMapping', sectionName: 'Context Mapping', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

