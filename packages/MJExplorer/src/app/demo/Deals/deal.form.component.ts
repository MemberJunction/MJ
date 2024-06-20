import { Component, OnInit } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { DealFormComponent } from 'src/app/generated/Entities/Deal/deal.form.component'; 
@RegisterClass(BaseFormComponent, 'Deals') // Tell MemberJunction about this class
@Component({
    selector: 'demo-deal-form',
    templateUrl: './deal.form.component.html',
    styleUrls: ['../../../shared/form-styles.css']
})
export class DealFormComponent_Demo extends DealFormComponent implements OnInit {

} 

export function LoadDealFormComponent() { }
