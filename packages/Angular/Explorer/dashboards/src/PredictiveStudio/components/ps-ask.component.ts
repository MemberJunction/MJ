import { ChangeDetectorRef, Component, Input, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { IMetadataProvider } from '@memberjunction/core';

import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import {
  buildAskAnswer,
  diagnosisHeadline,
  groupBySection,
  toObjective,
  type AskAnswerVM,
  type AskObjectiveVM,
} from '../ask.view-models';

/**
 * **Ask** — the answer-shaped front door.
 *
 * Every other Predictive Studio panel is shaped like the object model: a tree of component types, a
 * registry of models, a catalogue of algorithms. That is correct for someone building a model and
 * wrong for everyone else, who arrives with a question, not an object to inspect. This panel takes
 * the question.
 *
 * Two modes, because there are two real ways people arrive:
 *
 *  - **Ask a question** — *"why do members lapse?"* comes back as what we can measure about it and
 *    what we have already established, side by side.
 *  - **Check a document** — paste a strategic plan and get the same read for every objective in it.
 *    This is the first-meeting artefact: every gap is a piece of work someone can schedule.
 *
 * Nothing on this screen says "component", "instance" or "vector". Those are our words for our
 * object model; the reader's word is **measure**, and what they want to know is whether the
 * organization can put a number on the thing they asked about.
 *
 * The empty state carries as much weight as the results. A blank panel reads as *"we cannot do
 * this"*, when the true statement is nearly always *"nothing has been described that way yet"* —
 * so the absence is always narrated, never rendered as silence.
 */
@Component({
  standalone: true,
  selector: 'ps-ask',
  imports: [CommonModule, FormsModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.css', './ps-ask.component.css'],
  template: `
    <div class="ps-panel ps-ask" data-testid="ps-ask-panel">
      <!-- ── the question ─────────────────────────────────────────── -->
      <div class="ps-card ask-card">
        <div class="ps-card-body">
          <div class="mode-tabs" data-testid="ps-ask-modes">
            <button class="mode" [class.on]="mode === 'question'" data-testid="ps-ask-mode-question" (click)="setMode('question')">
              <i class="fa-solid fa-comment"></i> Ask a question
            </button>
            <button class="mode" [class.on]="mode === 'document'" data-testid="ps-ask-mode-document" (click)="setMode('document')">
              <i class="fa-solid fa-file-lines"></i> Check a document
            </button>
          </div>

          @if (mode === 'question') {
            <div class="ask-row">
              <input
                class="ask-input"
                type="text"
                data-testid="ps-ask-input"
                placeholder="What do we know about why members lapse?"
                [(ngModel)]="question"
                (keydown.enter)="ask()" />
              <button mjButton variant="primary" data-testid="ps-ask-submit" [disabled]="busy || !question.trim()" (click)="ask()">
                <i class="fa-solid fa-magnifying-glass"></i> Ask
              </button>
            </div>
            <div class="ps-muted ps-small suggestions" data-testid="ps-ask-suggestions">
              Try:
              @for (s of suggestions; track s) {
                <button class="suggestion" data-testid="ps-ask-suggestion" (click)="askThis(s)">{{ s }}</button>
              }
            </div>
          } @else {
            <textarea
              class="ask-textarea"
              rows="7"
              data-testid="ps-ask-document"
              placeholder="Paste a strategic plan, a funder report or a board paper. Every objective in it is checked against what you can measure and what you have learned."
              [(ngModel)]="document"></textarea>
            <div class="ask-row">
              <button mjButton variant="primary" data-testid="ps-ask-assess" [disabled]="busy || document.trim().length < 40" (click)="assess()">
                <i class="fa-solid fa-clipboard-check"></i> Check this document
              </button>
              <span class="ps-muted ps-small">Nothing is stored — the text is read once and discarded.</span>
            </div>
          }
        </div>
      </div>

      @if (busy) {
        <div class="ps-card"><div class="ps-card-body ps-muted" data-testid="ps-ask-busy">
          <i class="fa-solid fa-circle-notch fa-spin"></i> {{ mode === 'document' ? 'Reading the document…' : 'Looking…' }}
        </div></div>
      }

      @if (error) {
        <div class="ps-card error-card" data-testid="ps-ask-error" role="alert">
          <div class="ps-card-body">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <div><strong>Couldn't answer that.</strong><div class="ps-muted ps-small">{{ error }}</div></div>
          </div>
        </div>
      }

      <!-- ── the answer ───────────────────────────────────────────── -->
      @if (!busy && answer) {
        <div class="headline" data-testid="ps-ask-headline">{{ answer.headline }}</div>

        @if (answer.emptyNote) {
          <div class="ps-card empty-card" data-testid="ps-ask-empty">
            <div class="ps-card-body">
              <i class="fa-solid fa-circle-info"></i>
              <div>{{ answer.emptyNote }}</div>
            </div>
          </div>
        }

        <div class="answer-split">
          @if (answer.measures.length > 0) {
            <div class="ps-card">
              <div class="ps-card-head"><h3>What you can measure</h3></div>
              <div class="ps-card-body list" data-testid="ps-ask-measures">
                @for (m of answer.measures; track m.id) {
                  <div class="row" data-testid="ps-ask-measure">
                    <div class="row-head">
                      <span class="row-name">{{ m.name }}</span>
                      @if (m.reusable) {
                        <span class="tag" title="Can be pointed at a different group of records">reusable</span>
                      }
                    </div>
                    <div class="ps-muted ps-small row-kind">{{ m.kind }}</div>
                    @if (m.describes) { <div class="row-desc">{{ m.describes }}</div> }
                    <div class="bar"><div class="bar-fill" [style.width.%]="m.matchPercent"></div></div>
                  </div>
                }
              </div>
            </div>
          }

          @if (answer.facts.length > 0) {
            <div class="ps-card">
              <div class="ps-card-head"><h3>What you've learned</h3></div>
              <div class="ps-card-body list" data-testid="ps-ask-facts">
                @for (f of answer.facts; track f.id) {
                  <div class="row" data-testid="ps-ask-fact">
                    <div class="row-statement">{{ f.statement }}</div>
                    <div class="fact-meta">
                      <span class="tag" [class.tag-strong]="f.supportsAction" [title]="f.basis">{{ f.basis }}</span>
                      @if (f.size) { <span class="ps-small ps-muted">{{ f.size }}</span> }
                      @if (f.confidence) { <span class="ps-small ps-muted">{{ f.confidence }} confidence</span> }
                    </div>
                    @if (f.evidence || f.measuredAt) {
                      <div class="ps-muted ps-small">{{ f.evidence }}@if (f.evidence && f.measuredAt) { <span> · </span> }{{ f.measuredAt }}</div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- ── the diagnosis ────────────────────────────────────────── -->
      @if (!busy && objectives.length > 0) {
        <div class="headline" data-testid="ps-ask-diagnosis-headline">{{ diagnosisLine }}</div>
        @for (group of grouped; track group.section) {
          <div class="ps-card">
            <div class="ps-card-head"><h3>{{ group.section || 'Objectives' }}</h3></div>
            <div class="ps-card-body list" data-testid="ps-ask-objectives">
              @for (o of group.objectives; track o.index) {
                <div class="row objective" [attr.data-tone]="o.tone" data-testid="ps-ask-objective">
                  <div class="row-statement">{{ o.text }}</div>
                  <div class="fact-meta">
                    <span class="verdict" [attr.data-tone]="o.tone" data-testid="ps-ask-verdict">{{ o.verdictLabel }}</span>
                    <span class="ps-small ps-muted">{{ o.measureCount }} measure(s), {{ o.factCount }} fact(s) considered</span>
                  </div>
                  @if (o.rationale) { <div class="ps-muted ps-small">{{ o.rationale }}</div> }
                  <div class="next-step">{{ o.nextStep }}</div>
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class PSAskComponent {
  /**
   * The PROVIDER-SCOPED engine, bound by the host — never `PredictiveStudioEngine.Instance`.
   * A multi-provider client must read the server its resource is scoped to, and a singleton here
   * would silently answer from the default one.
   */
  @Input() public engine!: PredictiveStudioEngine;
  @Input() public Provider!: IMetadataProvider;

  private readonly cdr = inject(ChangeDetectorRef);

  public mode: 'question' | 'document' = 'question';
  public question = '';
  public document = '';
  public busy = false;
  public error: string | null = null;
  public answer: AskAnswerVM | null = null;
  public objectives: AskObjectiveVM[] = [];
  public grouped: Array<{ section: string; objectives: AskObjectiveVM[] }> = [];
  public diagnosisLine = '';

  /**
   * Starter questions.
   *
   * Deliberately phrased the way someone would actually say them, not as the measures they happen
   * to resolve to — the point of the panel is that you do not need to know what exists.
   */
  public readonly suggestions: readonly string[] = [
    'Why do members lapse?',
    'What predicts renewal?',
    'How engaged are our members?',
  ];

  public setMode(mode: 'question' | 'document'): void {
    this.mode = mode;
    // Clearing both results is deliberate: leaving the previous mode's answer on screen under a new
    // mode's controls invites reading one as an answer to the other.
    this.answer = null;
    this.objectives = [];
    this.grouped = [];
    this.error = null;
    this.cdr.detectChanges();
  }

  public askThis(question: string): void {
    this.question = question;
    void this.ask();
  }

  public async ask(): Promise<void> {
    const question = this.question.trim();
    if (!question || this.busy) return;
    this.busy = true;
    this.error = null;
    this.objectives = [];
    this.cdr.detectChanges();
    try {
      const { Signals, Findings } = await this.engine.Ask(question, this.Provider);
      this.answer = buildAskAnswer(question, Signals, Findings);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.answer = null;
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  public async assess(): Promise<void> {
    const text = this.document.trim();
    if (text.length < 40 || this.busy) return;
    this.busy = true;
    this.error = null;
    this.answer = null;
    this.cdr.detectChanges();
    try {
      const result = await this.engine.AssessDocument(text, this.Provider);
      this.objectives = result.Objectives.map(toObjective);
      this.grouped = groupBySection(this.objectives);
      this.diagnosisLine = diagnosisHeadline(this.objectives, result.SignalsConsidered);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.objectives = [];
      this.grouped = [];
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }
}
