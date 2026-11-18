import { Component } from '@angular/core';
import { MJArtifactGuestShareLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Artifact Guest Share Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjartifactguestsharelink-form',
    templateUrl: './mjartifactguestsharelink.form.component.html'
})
export class MJArtifactGuestShareLinkFormComponent extends BaseFormComponent {
    public record!: MJArtifactGuestShareLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

