/**
 * @fileoverview A visual authoring surface for a {@link FieldRuleSet} — the rules that drive a FieldRules
 * Record Process. Each rule sets a target field from a chosen source (static / another field / formula /
 * entity lookup / AI prompt), optionally gated by a condition. Validates live against the entity's metadata
 * via `EntityFieldRules.Validate`, and emits the typed rule set (the consumer serializes it into the
 * Record Process `Configuration`).
 * @module @memberjunction/ng-entity-action-ux
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { EntityFieldRules, Metadata, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import type { FieldRuleSet } from '@memberjunction/global';
import { AIPromptSelectorComponent } from '../ai-prompt-selector/ai-prompt-selector.component';
import { blankRuleDraft, draftsToRuleSet, ruleToDraft, type BuilderSourceKind, type RuleDraft } from '../field-rules-model';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';

@Component({
    selector: 'mj-field-rules-builder',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [AIPromptSelectorComponent, MJEmptyStateComponent],
    template: `
        <div class="frb">
            <div class="frb-head">
                <div>
                    <h3>Field rules</h3>
                    <p class="frb-sub">Each rule sets a field on every matching {{ EntityLabel }}. Use the preview before applying.</p>
                </div>
                <button type="button" class="frb-add" (click)="AddRule()"><i class="fa-solid fa-plus"></i> Add rule</button>
            </div>

            @if (Rules.length === 0) {
                <mj-empty-state class="frb-empty" Size="compact" Icon="" Title="No rules yet" Message="Click Add rule to start." />
            }

            @for (rule of Rules; track $index) {
                <div class="frb-rule">
                    <div class="frb-rule-head">
                        <span class="frb-rule-num">{{ $index + 1 }}</span>
                        <span class="frb-set">Set</span>
                        <select class="mj-input frb-target" [value]="rule.TargetField" (change)="SetTarget($index, $event)">
                            <option value="">— field —</option>
                            @for (f of WritableFields; track f.Name) { <option [value]="f.Name">{{ f.DisplayNameOrName }}</option> }
                        </select>
                        <span class="frb-set">from</span>
                        <select class="mj-input frb-kind" [value]="rule.SourceKind" (change)="SetKind($index, $event)">
                            <option value="static">a fixed value</option>
                            <option value="field">another field</option>
                            <option value="formula">a formula</option>
                            <option value="lookup">a lookup</option>
                            <option value="prompt">an AI prompt</option>
                        </select>
                        <button type="button" class="frb-del" title="Remove rule" (click)="RemoveRule($index)"><i class="fa-solid fa-trash"></i></button>
                    </div>

                    <div class="frb-source">
                        @switch (rule.SourceKind) {
                            @case ('static') {
                                <input class="mj-input" placeholder="Value" [value]="rule.StaticValue" (input)="SetField($index, 'StaticValue', $event)" />
                            }
                            @case ('field') {
                                <select class="mj-input" [value]="rule.SourceField" (change)="SetField($index, 'SourceField', $event)">
                                    <option value="">— source field —</option>
                                    @for (f of AllFields; track f.Name) { <option [value]="f.Name">{{ f.DisplayNameOrName }}</option> }
                                </select>
                            }
                            @case ('formula') {
                                <input class="mj-input" placeholder="e.g. fields.FirstName + ' ' + fields.LastName" [value]="rule.Formula" (input)="SetField($index, 'Formula', $event)" />
                            }
                            @case ('lookup') {
                                <div class="frb-lookup">
                                    <input class="mj-input" placeholder="Lookup entity" [value]="rule.LookupEntity" (input)="SetField($index, 'LookupEntity', $event)" />
                                    <input class="mj-input" placeholder="Match field" [value]="rule.LookupMatchField" (input)="SetField($index, 'LookupMatchField', $event)" />
                                    <input class="mj-input" placeholder="= this record's field" [value]="rule.LookupMatchValueField" (input)="SetField($index, 'LookupMatchValueField', $event)" />
                                    <input class="mj-input" placeholder="Return field" [value]="rule.LookupReturnField" (input)="SetField($index, 'LookupReturnField', $event)" />
                                </div>
                            }
                            @case ('prompt') {
                                <mj-ai-prompt-selector [Value]="rule.PromptID" (ValueChange)="SetPrompt($index, $event)"></mj-ai-prompt-selector>
                            }
                        }
                    </div>

                    <div class="frb-cond">
                        <span class="frb-cond-label">Only when</span>
                        <input class="mj-input" placeholder="(always) — e.g. fields.Status === 'Active'" [value]="rule.Condition" (input)="SetField($index, 'Condition', $event)" />
                    </div>
                </div>
            }

            @if (Errors.length > 0) {
                <div class="frb-errors">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <ul>@for (e of Errors; track e) { <li>{{ e }}</li> }</ul>
                </div>
            }
        </div>
    `,
    styles: [`
        .frb { color: var(--mj-text-primary); display: flex; flex-direction: column; gap: 12px; }
        .frb-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .frb-head h3 { margin: 0; font-size: 16px; }
        .frb-sub { margin: 2px 0 0; font-size: 13px; color: var(--mj-text-muted); }
        .frb-add { display: flex; align-items: center; gap: 6px; padding: 7px 12px; border: 1px solid var(--mj-brand-primary);
            color: var(--mj-brand-primary); background: transparent; border-radius: var(--mj-radius-sm, 6px); cursor: pointer; font-weight: 600; }
        .frb-add:hover { background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent); }
        .frb-empty { padding: 20px; text-align: center; color: var(--mj-text-muted); border: 1px dashed var(--mj-border-default);
            border-radius: var(--mj-radius-md, 8px); }
        .frb-rule { border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-md, 8px); padding: 12px; background: var(--mj-bg-surface-card); }
        .frb-rule-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .frb-rule-num { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
            border-radius: 50%; background: var(--mj-brand-primary); color: var(--mj-text-inverse); font-size: 12px; font-weight: 700; }
        .frb-set { color: var(--mj-text-secondary); font-size: 14px; }
        .frb-target, .frb-kind { min-width: 150px; }
        .frb-del { margin-left: auto; border: none; background: transparent; color: var(--mj-text-muted); cursor: pointer; padding: 4px 8px; }
        .frb-del:hover { color: var(--mj-status-error); }
        .frb-source { margin-top: 10px; }
        .frb-source .mj-input { width: 100%; }
        .frb-lookup { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; }
        .frb-cond { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
        .frb-cond-label { font-size: 13px; color: var(--mj-text-muted); white-space: nowrap; }
        .frb-cond .mj-input { flex: 1; }
        .frb-errors { display: flex; gap: 10px; padding: 10px 12px; background: var(--mj-status-error-bg); color: var(--mj-status-error-text);
            border-radius: var(--mj-radius-sm, 6px); font-size: 13px; }
        .frb-errors ul { margin: 0; padding-left: 18px; }
    `],
})
export class FieldRulesBuilderComponent {
    private cdr = inject(ChangeDetectorRef);

    public Rules: RuleDraft[] = [];
    public Errors: string[] = [];
    public WritableFields: Array<{ Name: string; DisplayNameOrName: string }> = [];
    public AllFields: Array<{ Name: string; DisplayNameOrName: string }> = [];

    private _entityName = '';
    private entity?: EntityInfo;

    /** Metadata provider (multi-provider). Falls back to the global default when null. */
    @Input() Provider: IMetadataProvider | null = null;

    /** The entity whose fields the rules target. Loads the field lists when set. */
    @Input()
    set EntityName(value: string) {
        const prev = this._entityName;
        this._entityName = value;
        if (value && value !== prev) this.loadEntity();
    }
    get EntityName(): string { return this._entityName; }

    /**
     * Serialized form of our last emitted rule set. Consumers typically feed our `ValueChange` output
     * straight back in as `[Value]` (controlled-component style). Re-seeding the drafts from that echo
     * would wipe in-progress edits — most visibly a freshly-added **blank** rule, which serializes to
     * nothing (`draftsToRuleSet` drops rules with no target), so the echo arrives as `{Rules:[]}` and
     * resets the row the user just added. We ignore the echo and only re-seed on a genuinely different
     * (external) value.
     */
    private lastEmittedJSON: string | null = null;

    /** The initial rule set (e.g. an existing Record Process Configuration). */
    @Input()
    set Value(value: FieldRuleSet | null | undefined) {
        const incomingJSON = JSON.stringify(value?.Rules ?? []);
        if (incomingJSON === this.lastEmittedJSON) {
            return; // echo of our own emit — keep the live drafts intact
        }
        this.lastEmittedJSON = incomingJSON;
        this.Rules = value?.Rules ? value.Rules.map((r) => ruleToDraft(r)) : [];
        this.validate();
    }

    /** Emits the typed rule set on every edit; the consumer serializes it into the Configuration. */
    @Output() ValueChange = new EventEmitter<FieldRuleSet>();

    /** Emits the live validation result (true when every rule is valid against the entity). */
    @Output() ValidChange = new EventEmitter<boolean>();

    get EntityLabel(): string { return this.entity?.DisplayName || this.entity?.Name || 'record'; }

    AddRule(): void {
        this.Rules = [...this.Rules, blankRuleDraft()];
        this.emit();
    }

    RemoveRule(index: number): void {
        this.Rules = this.Rules.filter((_, i) => i !== index);
        this.emit();
    }

    SetTarget(index: number, event: Event): void {
        this.Rules[index].TargetField = (event.target as HTMLSelectElement).value;
        this.emit();
    }

    SetKind(index: number, event: Event): void {
        this.Rules[index].SourceKind = (event.target as HTMLSelectElement).value as BuilderSourceKind;
        this.emit();
    }

    SetField(index: number, field: keyof RuleDraft, event: Event): void {
        (this.Rules[index][field] as string) = (event.target as HTMLInputElement | HTMLSelectElement).value;
        this.emit();
    }

    SetPrompt(index: number, promptID: string | null): void {
        this.Rules[index].PromptID = promptID;
        this.emit();
    }

    /** Serializes the drafts, validates, and emits. */
    private emit(): void {
        const ruleSet = draftsToRuleSet(this.Rules);
        // Record what we're about to emit so the echo (consumer feeding it back via [Value]) is recognized
        // and ignored — see lastEmittedJSON. Must mirror the Value setter's comparison basis (Rules array).
        this.lastEmittedJSON = JSON.stringify(ruleSet.Rules ?? []);
        this.validate(ruleSet);
        this.ValueChange.emit(ruleSet);
        this.cdr.detectChanges();
    }

    private validate(ruleSet: FieldRuleSet = draftsToRuleSet(this.Rules)): void {
        if (!this._entityName) {
            this.Errors = [];
        } else {
            const result = EntityFieldRules.Validate(this._entityName, ruleSet, this.Provider ?? undefined);
            this.Errors = result.Errors;
            this.ValidChange.emit(result.Valid);
        }
        this.cdr.detectChanges();
    }

    private loadEntity(): void {
        this.entity = (this.Provider ?? Metadata.Provider)?.EntityByName(this._entityName);
        const map = (f: { Name: string; DisplayName?: string }) => ({ Name: f.Name, DisplayNameOrName: f.DisplayName || f.Name });
        this.AllFields = this.entity ? this.entity.Fields.map(map) : [];
        this.WritableFields = this.entity ? this.entity.Fields.filter((f) => !f.ReadOnly && !f.IsPrimaryKey).map(map) : [];
        this.validate();
    }
}
