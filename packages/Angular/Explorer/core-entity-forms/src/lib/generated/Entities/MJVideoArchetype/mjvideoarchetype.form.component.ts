import { Component } from '@angular/core';
import { MJVideoArchetypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Video Archetypes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjvideoarchetype-form',
    templateUrl: './mjvideoarchetype.form.component.html'
})
export class MJVideoArchetypeFormComponent extends BaseFormComponent {
    public record!: MJVideoArchetypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

