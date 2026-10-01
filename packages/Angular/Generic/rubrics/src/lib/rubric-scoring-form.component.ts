import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { RubricNodeSnapshot, RubricScaleSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { answerLevel, canSubmit, incompleteAnswers, type RubricFormAnswer } from './model.js';

/**
 * Answer form. Keyboard: a digit selects that level, and N marks not applicable.
 * Every change emits AnswersChange so the host can autosave the draft.
 * Submit stays disabled until required rationale and evidence are present.
 */
@Component({
    standalone: true,
    selector: 'mj-rubric-scoring-form',
    imports: [CommonModule],
    templateUrl: './rubric-scoring-form.component.html',
    styleUrls: ['./rubric-scoring-form.component.css'],
})
export class RubricScoringFormComponent {
    @Input() Version: RubricVersionSnapshot | null = null;
    @Input() Answers: RubricFormAnswer[] = [];
    @Output() AnswersChange = new EventEmitter<RubricFormAnswer[]>();
    @Output() Submit = new EventEmitter<RubricFormAnswer[]>();

    public get Leaves(): RubricNodeSnapshot[] {
        return (this.Version?.nodes ?? []).filter(node => node.nodeType === 'Criterion');
    }

    public get Problems(): string[] {
        return incompleteAnswers(this.Version?.nodes ?? [], this.Answers);
    }

    public get CanSubmit(): boolean {
        return this.Version !== null && canSubmit(this.Version.nodes, this.Answers);
    }

    public Scale(node: RubricNodeSnapshot): RubricScaleSnapshot | undefined {
        return this.Version?.scales.find(scale => scale.id === node.scaleId);
    }

    public Selected(node: RubricNodeSnapshot, levelId: string): boolean {
        return this.Answers.find(item => item.criterionId === node.id)?.scaleLevelId === levelId;
    }

    public IsNotApplicable(node: RubricNodeSnapshot): boolean {
        return this.Answers.find(item => item.criterionId === node.id)?.isNotApplicable === true;
    }

    public OnLevel(node: RubricNodeSnapshot, levelId: string): void {
        this.AnswersChange.emit(answerLevel(this.Answers, node.id, levelId, false));
    }

    public OnNotApplicable(node: RubricNodeSnapshot): void {
        this.AnswersChange.emit(answerLevel(this.Answers, node.id, null, !this.IsNotApplicable(node)));
    }

    public OnText(node: RubricNodeSnapshot, field: 'rationale' | 'evidence', event: Event): void {
        const value = (event.target as HTMLTextAreaElement).value;
        const current = this.Answers.find(item => item.criterionId === node.id);
        const next = this.Answers.filter(item => item.criterionId !== node.id);
        next.push({ criterionId: node.id, scaleLevelId: current?.scaleLevelId, isNotApplicable: current?.isNotApplicable, rationale: current?.rationale, evidence: current?.evidence, [field]: value });
        this.AnswersChange.emit(next);
    }

    public OnKey(node: RubricNodeSnapshot, event: KeyboardEvent): void {
        const scale = this.Scale(node);
        const digit = Number(event.key);
        if (scale && digit >= 1 && digit <= scale.levels.length) {
            this.OnLevel(node, scale.levels[digit - 1].id);
            event.preventDefault();
        }
        if (event.key === 'n' || event.key === 'N') {
            this.OnNotApplicable(node);
            event.preventDefault();
        }
    }

    public OnSubmit(): void {
        if (this.CanSubmit) this.Submit.emit(this.Answers);
    }
}
