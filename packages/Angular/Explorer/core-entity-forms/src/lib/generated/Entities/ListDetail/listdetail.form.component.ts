import { Component } from '@angular/core';
import { ListDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'List Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-listdetail-form',
    templateUrl: './listdetail.form.component.html'
})
export class ListDetailFormComponent extends BaseFormComponent {
    public record!: ListDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'listReference', sectionName: 'List Reference', isExpanded: true },
            { sectionKey: 'detailAttributes', sectionName: 'Detail Attributes', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

