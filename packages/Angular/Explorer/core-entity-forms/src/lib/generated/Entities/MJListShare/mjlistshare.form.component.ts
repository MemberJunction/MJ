import { Component } from '@angular/core';
import { MJListShareEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: List Shares') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjlistshare-form',
    templateUrl: './mjlistshare.form.component.html'
})
export class MJListShareFormComponent extends BaseFormComponent {
    public record!: MJListShareEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'shareDetails', sectionName: 'Share Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

