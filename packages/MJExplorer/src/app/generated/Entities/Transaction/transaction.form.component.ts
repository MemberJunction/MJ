import { Component } from '@angular/core';
import { TransactionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Transactions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-transaction-form',
    templateUrl: './transaction.form.component.html'
})
export class TransactionFormComponent extends BaseFormComponent {
    public record!: TransactionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

