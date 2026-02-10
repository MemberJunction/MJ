import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-form-selects',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        MatSelectModule,
        MatAutocompleteModule,
        MatChipsModule,
        MatFormFieldModule,
        MatInputModule,
        MatIconModule
    ],
    template: `
    <div class="page-container">

      <!-- ======================================== -->
      <!-- SECTION 1: Select                        -->
      <!-- ======================================== -->
      <section class="section">
        <h2 class="section-title">Select</h2>
        <p class="section-desc">
          Dropdown selects using <code>mat-select</code> inside <code>mat-form-field</code>.
          The option panel background maps to <code>--mj-bg-surface-elevated</code>.
        </p>

        <div class="demo-row mj-grid mj-gap-3">
          <!-- Basic select -->
          <mat-form-field appearance="outline" class="demo-field mj-col">
            <mat-label>Favorite Fruit</mat-label>
            <mat-select [(ngModel)]="selectedFruit">
              @for (fruit of fruits; track fruit) {
                <mat-option [value]="fruit">{{ fruit }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <!-- Select with placeholder -->
          <mat-form-field appearance="outline" class="demo-field mj-col">
            <mat-label>Choose a fruit</mat-label>
            <mat-select placeholder="Pick one...">
              @for (fruit of fruits; track fruit) {
                <mat-option [value]="fruit">{{ fruit }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <!-- Disabled select -->
          <mat-form-field appearance="outline" class="demo-field mj-col">
            <mat-label>Disabled</mat-label>
            <mat-select disabled [value]="'Cherry'">
              @for (fruit of fruits; track fruit) {
                <mat-option [value]="fruit">{{ fruit }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        <!-- Multi-select -->
        <div class="demo-row mj-grid mj-gap-3">
          <mat-form-field appearance="outline" class="demo-field demo-field-wide mj-col">
            <mat-label>Favorite Toppings</mat-label>
            <mat-select [(ngModel)]="selectedToppings" multiple>
              @for (topping of toppings; track topping) {
                <mat-option [value]="topping">{{ topping }}</mat-option>
              }
            </mat-select>
            <mat-hint>{{ selectedToppings.length }} selected</mat-hint>
          </mat-form-field>
        </div>

        <!-- Grouped select -->
        <div class="demo-row mj-grid mj-gap-3">
          <mat-form-field appearance="outline" class="demo-field demo-field-wide mj-col">
            <mat-label>Grouped Select</mat-label>
            <mat-select [(ngModel)]="selectedGrouped">
              <mat-optgroup label="Citrus">
                <mat-option value="Lemon">Lemon</mat-option>
                <mat-option value="Lime">Lime</mat-option>
                <mat-option value="Orange">Orange</mat-option>
              </mat-optgroup>
              <mat-optgroup label="Berries">
                <mat-option value="Strawberry">Strawberry</mat-option>
                <mat-option value="Blueberry">Blueberry</mat-option>
                <mat-option value="Raspberry">Raspberry</mat-option>
              </mat-optgroup>
              <mat-optgroup label="Tropical">
                <mat-option value="Mango">Mango</mat-option>
                <mat-option value="Pineapple">Pineapple</mat-option>
                <mat-option value="Papaya">Papaya</mat-option>
              </mat-optgroup>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="token-note">
          <mat-icon class="token-icon">palette</mat-icon>
          <span>Panel background &rarr; <code>--mj-bg-surface-elevated</code></span>
        </div>
      </section>

      <!-- ======================================== -->
      <!-- SECTION 2: Autocomplete                  -->
      <!-- ======================================== -->
      <section class="section">
        <h2 class="section-title">Autocomplete</h2>
        <p class="section-desc">
          Type-ahead suggestions using <code>mat-autocomplete</code> bound to a text input.
          The suggestion panel uses <code>--mj-bg-surface-elevated</code>.
        </p>

        <div class="demo-row mj-grid mj-gap-3">
          <!-- Basic autocomplete -->
          <mat-form-field appearance="outline" class="demo-field demo-field-wide mj-col">
            <mat-label>Search fruits</mat-label>
            <input matInput
                   [(ngModel)]="autoValue"
                   (ngModelChange)="FilterFruits()"
                   [matAutocomplete]="fruitAuto"
                   placeholder="Start typing...">
            <mat-autocomplete #fruitAuto="matAutocomplete">
              @for (option of filteredFruits; track option) {
                <mat-option [value]="option">{{ option }}</mat-option>
              }
            </mat-autocomplete>
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>

          <!-- Autocomplete with custom template -->
          <mat-form-field appearance="outline" class="demo-field demo-field-wide mj-col">
            <mat-label>Fruit with icon</mat-label>
            <input matInput
                   [(ngModel)]="autoValueTemplated"
                   (ngModelChange)="FilterFruitsTemplated()"
                   [matAutocomplete]="fruitAutoTemplated"
                   placeholder="Type to search...">
            <mat-autocomplete #fruitAutoTemplated="matAutocomplete">
              @for (option of filteredFruitsTemplated; track option) {
                <mat-option [value]="option">
                  <div class="autocomplete-option mj-grid mj-flex-nowrap mj-gap-2 mj-align-center">
                    <mat-icon class="option-icon">eco</mat-icon>
                    <span>{{ option }}</span>
                  </div>
                </mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
        </div>

        <div class="token-note">
          <mat-icon class="token-icon">palette</mat-icon>
          <span>Panel &rarr; <code>--mj-bg-surface-elevated</code></span>
        </div>
      </section>

      <!-- ======================================== -->
      <!-- SECTION 3: Chips                         -->
      <!-- ======================================== -->
      <section class="section">
        <h2 class="section-title">Chips</h2>
        <p class="section-desc">
          Display and input chips using <code>mat-chip-set</code> and <code>mat-chip-grid</code>.
          Chip background maps to <code>--mj-bg-surface-sunken</code>.
        </p>

        <!-- Display chips (read-only) -->
        <div class="demo-block">
          <h3 class="demo-label">Display Chips (read-only)</h3>
          <mat-chip-set>
            @for (tag of displayTags; track tag) {
              <mat-chip>
                <mat-icon matChipAvatar>tag</mat-icon>
                {{ tag }}
              </mat-chip>
            }
          </mat-chip-set>
        </div>

        <!-- Input chips (add / remove) -->
        <div class="demo-block">
          <h3 class="demo-label">Input Chips (add / remove)</h3>
          <mat-form-field appearance="outline" class="demo-field demo-field-wide mj-col">
            <mat-label>Technologies</mat-label>
            <mat-chip-grid #chipGrid>
              @for (chip of chipValues; track chip) {
                <mat-chip-row (removed)="RemoveChip(chip)">
                  {{ chip }}
                  <button matChipRemove>
                    <mat-icon>cancel</mat-icon>
                  </button>
                </mat-chip-row>
              }
            </mat-chip-grid>
            <input placeholder="Add a technology..."
                   [matChipInputFor]="chipGrid"
                   (matChipInputTokenEnd)="AddChip($event)" />
          </mat-form-field>
        </div>

        <!-- Colored chips -->
        <div class="demo-block">
          <h3 class="demo-label">Colored Chips</h3>
          <mat-chip-set>
            <mat-chip class="chip-primary">Primary</mat-chip>
            <mat-chip class="chip-accent">Accent</mat-chip>
            <mat-chip class="chip-success">Success</mat-chip>
            <mat-chip class="chip-warning">Warning</mat-chip>
            <mat-chip class="chip-error">Error</mat-chip>
          </mat-chip-set>
        </div>

        <div class="token-note">
          <mat-icon class="token-icon">palette</mat-icon>
          <span>Chip bg &rarr; <code>--mj-bg-surface-sunken</code></span>
        </div>
      </section>

    </div>
  `,
    styles: [`
    .page-container {
      max-width: 900px;
      margin: 0 auto;
      font-family: var(--mj-font-family);
      color: var(--mj-text-primary);
    }

    /* ---- Section layout ---- */
    .section {
      margin-bottom: var(--mj-space-10);
    }

    .section-title {
      font-size: var(--mj-text-2xl);
      font-weight: var(--mj-font-bold);
      color: var(--mj-text-primary);
      margin: 0 0 var(--mj-space-2) 0;
    }

    .section-desc {
      font-size: var(--mj-text-sm);
      color: var(--mj-text-secondary);
      margin: 0 0 var(--mj-space-5) 0;
      line-height: var(--mj-leading-relaxed);

      code {
        background-color: var(--mj-bg-surface-sunken);
        padding: 2px 6px;
        border-radius: var(--mj-radius-sm);
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-brand-primary);
      }
    }

    /* ---- Demo layouts ---- */
    .demo-row {
      margin-bottom: var(--mj-space-5);
    }

    .demo-field {
      min-width: 200px;
    }

    .demo-field-wide {
      min-width: 280px;
      max-width: 400px;
    }

    .demo-block {
      background-color: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-lg);
      padding: var(--mj-space-5);
      margin-bottom: var(--mj-space-4);
    }

    .demo-label {
      font-size: var(--mj-text-sm);
      font-weight: var(--mj-font-semibold);
      color: var(--mj-text-secondary);
      margin: 0 0 var(--mj-space-3) 0;
    }

    /* ---- Token note ---- */
    .token-note {
      display: inline-flex;
      align-items: center;
      gap: var(--mj-space-2);
      background-color: var(--mj-status-info-bg);
      border: 1px solid var(--mj-status-info-border);
      border-radius: var(--mj-radius-md);
      padding: var(--mj-space-2) var(--mj-space-4);
      font-size: var(--mj-text-xs);
      color: var(--mj-status-info-text);

      code {
        background-color: color-mix(in srgb, var(--mj-status-info) 10%, transparent);
        padding: 1px 5px;
        border-radius: var(--mj-radius-sm);
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
      }
    }

    .token-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    /* ---- Autocomplete option template ---- */

    .option-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--mj-brand-primary);
    }

    /* ---- Colored chips ---- */
    .chip-primary {
      --mdc-chip-elevated-container-color: color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
      --mdc-chip-label-text-color: var(--mj-brand-primary);
    }

    .chip-accent {
      --mdc-chip-elevated-container-color: color-mix(in srgb, var(--mj-brand-accent) 20%, transparent);
      --mdc-chip-label-text-color: var(--mj-color-accent-700);
    }

    .chip-success {
      --mdc-chip-elevated-container-color: var(--mj-status-success-bg);
      --mdc-chip-label-text-color: var(--mj-status-success-text);
    }

    .chip-warning {
      --mdc-chip-elevated-container-color: var(--mj-status-warning-bg);
      --mdc-chip-label-text-color: var(--mj-status-warning-text);
    }

    .chip-error {
      --mdc-chip-elevated-container-color: var(--mj-status-error-bg);
      --mdc-chip-label-text-color: var(--mj-status-error-text);
    }
  `]
})
export class FormSelectsComponent {
    /* ---- Select state ---- */
    selectedFruit = '';
    selectedGrouped = '';
    selectedToppings: string[] = [];
    fruits = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape'];
    toppings = ['Pepperoni', 'Mushrooms', 'Onions', 'Sausage', 'Olives', 'Green Peppers', 'Jalapeños'];

    /* ---- Autocomplete state ---- */
    autoValue = '';
    filteredFruits: string[] = [];
    autoValueTemplated = '';
    filteredFruitsTemplated: string[] = [];

    /* ---- Chips state ---- */
    chipValues: string[] = ['Angular', 'Material', 'TypeScript'];
    displayTags: string[] = ['Design Tokens', 'MJ Branding', 'Dark Mode', 'Responsive'];

    constructor() {
        this.filteredFruits = [...this.fruits];
        this.filteredFruitsTemplated = [...this.fruits];
    }

    FilterFruits(): void {
        const query = this.autoValue.toLowerCase();
        this.filteredFruits = query
            ? this.fruits.filter(f => f.toLowerCase().includes(query))
            : [...this.fruits];
    }

    FilterFruitsTemplated(): void {
        const query = this.autoValueTemplated.toLowerCase();
        this.filteredFruitsTemplated = query
            ? this.fruits.filter(f => f.toLowerCase().includes(query))
            : [...this.fruits];
    }

    AddChip(event: { value: string; chipInput: { clear: () => void } }): void {
        const value = (event.value || '').trim();
        if (value && !this.chipValues.includes(value)) {
            this.chipValues.push(value);
        }
        event.chipInput.clear();
    }

    RemoveChip(chip: string): void {
        const index = this.chipValues.indexOf(chip);
        if (index >= 0) {
            this.chipValues.splice(index, 1);
        }
    }
}
