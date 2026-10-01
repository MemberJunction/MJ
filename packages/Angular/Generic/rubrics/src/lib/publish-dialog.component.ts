import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { publishPreview, type PublishPreview } from './model.js';

/** Shows the computed bump, each change, and an optional higher bump. Confirm emits. The widget does not publish. */
@Component({
    standalone: true,
    selector: 'mj-rubric-publish-dialog',
    imports: [CommonModule],
    templateUrl: './publish-dialog.component.html',
    styleUrls: ['./rubric-builder.component.css'],
})
export class RubricPublishDialogComponent {
    @Input() Base: RubricVersionSnapshot | null = null;
    @Input() Draft: RubricVersionSnapshot | null = null;
    @Input() RequestedBump: 'Major' | 'Minor' | 'Patch' | null = null;
    @Input() Summary = '';
    @Output() RequestedBumpChange = new EventEmitter<'Major' | 'Minor' | 'Patch' | null>();
    @Output() SummaryChange = new EventEmitter<string>();
    @Output() Confirm = new EventEmitter<{ bump: string | null; summary: string }>();

    public get Preview(): PublishPreview | null {
        return this.Draft ? publishPreview(this.Base, this.Draft, this.RequestedBump) : null;
    }

    public OnBump(event: Event): void {
        const value = (event.target as HTMLSelectElement).value;
        this.RequestedBumpChange.emit(value === '' ? null : value as 'Major' | 'Minor' | 'Patch');
    }

    public OnSummary(event: Event): void {
        this.SummaryChange.emit((event.target as HTMLTextAreaElement).value);
    }

    public OnConfirm(): void {
        if (this.Preview && !this.Preview.identical) this.Confirm.emit({ bump: this.Preview.appliedBump, summary: this.Summary });
    }
}
