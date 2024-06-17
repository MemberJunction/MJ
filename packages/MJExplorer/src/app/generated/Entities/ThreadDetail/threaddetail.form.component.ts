import { Component } from '@angular/core';
import { ThreadDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadThreadDetailDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Thread Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-threaddetail-form',
    templateUrl: './threaddetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ThreadDetailFormComponent extends BaseFormComponent {
    public record!: ThreadDetailEntity;
} 

export function LoadThreadDetailFormComponent() {
    LoadThreadDetailDetailsComponent();
}
