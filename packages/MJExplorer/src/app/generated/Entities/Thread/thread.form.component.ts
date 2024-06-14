import { Component } from '@angular/core';
import { ThreadEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadThreadDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Threads') // Tell MemberJunction about this class
@Component({
    selector: 'gen-thread-form',
    templateUrl: './thread.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ThreadFormComponent extends BaseFormComponent {
    public record!: ThreadEntity;
} 

export function LoadThreadFormComponent() {
    LoadThreadDetailsComponent();
}
