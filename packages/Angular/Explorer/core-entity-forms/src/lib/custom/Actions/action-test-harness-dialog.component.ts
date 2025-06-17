import { Component, Input, OnInit } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { ActionEntity, ActionParamEntity } from '@memberjunction/core-entities';

@Component({
    selector: 'mj-action-test-harness-dialog',
    template: `
        <kendo-dialog-titlebar>
            <div style="display: flex; align-items: center; gap: 12px;">
                <i class="fa-solid fa-flask" style="color: #6f42c1;"></i>
                Action Test Harness - {{ action.Name }}
            </div>
        </kendo-dialog-titlebar>
        
        <div style="max-height: 80vh; overflow-y: auto;">
            <mj-action-test-harness 
                [action]="action"
                [actionParams]="actionParams">
            </mj-action-test-harness>
        </div>
        
        <kendo-dialog-actions>
            <kendo-button (click)="close()">Close</kendo-button>
        </kendo-dialog-actions>
    `,
    styles: [`
        :host {
            display: block;
        }
    `]
})
export class ActionTestHarnessDialogComponent implements OnInit {
    @Input() action!: ActionEntity;
    @Input() actionParams: ActionParamEntity[] = [];

    constructor(
        private dialog: DialogRef
    ) {}

    ngOnInit() {
        // Any initialization if needed
    }

    close() {
        this.dialog.close();
    }
}