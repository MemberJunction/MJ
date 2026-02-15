import { Component } from '@angular/core';
import { MJListDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: List Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjlistdetail-form',
    templateUrl: './mjlistdetail.form.component.html'
})
export class MJListDetailFormComponent extends BaseFormComponent {
    public record!: MJListDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'listReference', sectionName: 'List Reference', isExpanded: true },
            { sectionKey: 'detailAttributes', sectionName: 'Detail Attributes', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

