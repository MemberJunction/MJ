import { Component } from '@angular/core';
import { MJSignatureRequestLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Signature Request Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsignaturerequestlog-form',
    templateUrl: './mjsignaturerequestlog.form.component.html'
})
export class MJSignatureRequestLogFormComponent extends BaseFormComponent {
    public record!: MJSignatureRequestLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'signatureRequestReference', sectionName: 'Signature Request Reference', isExpanded: true },
            { sectionKey: 'operationDetails', sectionName: 'Operation Details', isExpanded: true },
            { sectionKey: 'statusTransition', sectionName: 'Status Transition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

