import { Component } from '@angular/core';
import { MJArtifactWorkingStateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Artifact Working States') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjartifactworkingstate-form',
    templateUrl: './mjartifactworkingstate.form.component.html'
})
export class MJArtifactWorkingStateFormComponent extends BaseFormComponent {
    public record!: MJArtifactWorkingStateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'collaborativeState', sectionName: 'Collaborative State', isExpanded: true },
            { sectionKey: 'editTracking', sectionName: 'Edit Tracking', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

