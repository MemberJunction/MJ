import { Component } from '@angular/core';
import { MJRecordArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Record Artifacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordartifact-form',
    templateUrl: './mjrecordartifact.form.component.html'
})
export class MJRecordArtifactFormComponent extends BaseFormComponent {
    public record!: MJRecordArtifactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

