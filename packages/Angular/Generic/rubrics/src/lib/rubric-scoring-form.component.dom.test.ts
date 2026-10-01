import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RubricScoringFormComponent } from './rubric-scoring-form.component';
import { draft } from './dom-fixture';

describe('RubricScoringFormComponent (DOM)', () => {
    function render() {
        const fixture = TestBed.createComponent(RubricScoringFormComponent);
        const tree = draft();
        tree.nodes[0].rationaleRequired = true;
        fixture.componentInstance.Version = tree;
        fixture.detectChanges();
        return { fixture, host: fixture.nativeElement as HTMLElement };
    }

    it('keeps submit disabled until the leaf is answered', () => {
        const { host } = render();
        expect(host.querySelector('legend')?.textContent).toBe('Clarity');
        expect((host.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    });

    it('emits the level when its button is clicked and then allows submit', () => {
        const { fixture, host } = render();
        const answers: { scaleLevelId?: string | null }[][] = [];
        fixture.componentInstance.AnswersChange.subscribe(next => answers.push(next));
        const level = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('High')) as HTMLButtonElement;
        level.click();
        expect(answers[0][0].scaleLevelId).toBe('high');
        fixture.componentInstance.Answers = answers[0];
        fixture.componentInstance.Answers[0].rationale = 'Clear.';
        fixture.detectChanges();
        const submit = host.querySelector('button[type="submit"]') as HTMLButtonElement;
        expect(submit.disabled).toBe(false);
        const submitted: unknown[] = [];
        fixture.componentInstance.Submit.subscribe(value => submitted.push(value));
        submit.click();
        expect(submitted).toHaveLength(1);
    });

    it('selects a level from a digit on the fieldset and ignores that digit inside the rationale', () => {
        const { fixture, host } = render();
        const answers: { scaleLevelId?: string | null; isNotApplicable?: boolean }[][] = [];
        fixture.componentInstance.AnswersChange.subscribe(next => answers.push(next));
        host.querySelector('fieldset')?.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
        expect(answers.at(-1)?.[0].scaleLevelId).toBe('high');
        const before = answers.length;
        const notes = host.querySelector('textarea') as HTMLTextAreaElement;
        notes.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
        expect(answers).toHaveLength(before);
    });

    it('marks not applicable from n on the fieldset', () => {
        const { fixture, host } = render();
        const answers: { isNotApplicable?: boolean }[][] = [];
        fixture.componentInstance.AnswersChange.subscribe(next => answers.push(next));
        const event = new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true });
        const prevented = vi.spyOn(event, 'preventDefault');
        host.querySelector('fieldset')?.dispatchEvent(event);
        expect(answers.at(-1)?.[0].isNotApplicable).toBe(true);
        expect(prevented).toHaveBeenCalled();
    });
});
