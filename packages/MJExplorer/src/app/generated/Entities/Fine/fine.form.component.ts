import { Component } from '@angular/core';
import { FineEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Fines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-fine-form',
    templateUrl: './fine.form.component.html'
})
export class FineFormComponent extends BaseFormComponent {
    public record!: FineEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

