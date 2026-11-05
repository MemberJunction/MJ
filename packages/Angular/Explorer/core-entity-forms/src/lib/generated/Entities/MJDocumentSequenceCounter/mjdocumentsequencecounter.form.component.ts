import { Component } from '@angular/core';
import { MJDocumentSequenceCounterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Document Sequence Counters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdocumentsequencecounter-form',
    templateUrl: './mjdocumentsequencecounter.form.component.html'
})
export class MJDocumentSequenceCounterFormComponent extends BaseFormComponent {
    public record!: MJDocumentSequenceCounterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

