import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { ChosenPublishBump, publishPreview, type PublishPreview } from './model.js';

/** Shows the computed bump, each change, and an optional higher bump. Confirm emits. The widget does not publish. */
@Component({
    standalone: true,
    selector: 'mj-rubric-publish-dialog',
    imports: [CommonModule, MJButtonDirective],
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
        if (!this.Preview || this.Preview.identical) return;
        this.Confirm.emit({ bump: ChosenPublishBump(this.RequestedBump), summary: this.Summary });
    }

    public get BumpLabel(): string {
        const preview = this.Preview;
        if (!preview) return '';
        const bump = preview.computedBump ?? preview.appliedBump ?? 'none';
        return preview.nextVersion ? `${bump} → ${preview.nextVersion}` : bump;
    }

    public get Why(): string {
        const bump = this.Preview?.computedBump ?? this.Preview?.appliedBump;
        if (this.Preview?.identical) return 'This draft matches the published version, so there is nothing to publish.';
        if (!bump || bump === 'Initial') return 'This is the first publish. The next version is 1.0.0.';
        if (bump === 'Major') return 'A scoring change breaks comparison with the published version.';
        if (bump === 'Minor') return 'The structure changed. Scores still compare with the published version.';
        return 'Wording changed. Scores still compare with the published version.';
    }

    public SubjectName(subject: string): string {
        const nodes = [...(this.Draft?.nodes ?? []), ...(this.Base?.nodes ?? [])];
        const node = nodes.find(item => item.key === subject || item.name === subject);
        if (node?.name) return node.name;
        if (subject === 'version') return 'Version';
        return subject.charAt(0).toUpperCase() + subject.slice(1);
    }

    public ChangeText(property: string): string {
        const words: Record<string, string> = {
            Weight: 'Weight changed',
            IsGate: 'Quality gate changed',
            GateMinimumScore: 'Gate minimum changed',
            Sequence: 'Order changed',
            Descriptor: 'An anchor changed',
            Name: 'Name changed',
            added: 'Added',
            removed: 'Removed',
            'band added': 'Band added',
            'band removed': 'Band removed',
            'band range': 'Band range changed',
            'band wording': 'Band wording changed',
            Instructions: 'Instructions changed',
            NotApplicablePolicy: 'Not-applicable policy changed',
            PassThreshold: 'Pass threshold changed',
        };
        return words[property] ?? property;
    }
}
