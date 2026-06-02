import { Component } from '@angular/core';
import { MJActionResultCodeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Action Result Codes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjactionresultcode-form',
    templateUrl: './mjactionresultcode.form.component.html'
})
export class MJActionResultCodeFormComponent extends BaseFormComponent {
    public record!: MJActionResultCodeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actionMapping', sectionName: 'Action Mapping', isExpanded: true },
            { sectionKey: 'resultCodeDetails', sectionName: 'Result Code Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

