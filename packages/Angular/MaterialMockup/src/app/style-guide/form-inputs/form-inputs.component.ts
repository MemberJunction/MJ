import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-form-inputs',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatCheckboxModule,
        MatRadioModule,
        MatSlideToggleModule,
        MatSliderModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatIconModule
    ],
    template: `
    <div class="form-inputs-page">

      <!-- ========================================
           SECTION 1: Text Inputs
           ======================================== -->
      <section class="section">
        <div class="section-header">
          <h2>Text Inputs</h2>
          <p class="section-description">
            Standard text inputs using <code>matInput</code> within <code>mat-form-field</code>.
            Outline borders map to <code>--mj-border-default</code>, focus state uses <code>--mj-border-focus</code>.
          </p>
        </div>

        <h3 class="subsection-title">Outlined Appearance</h3>
        <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">Default</label>
            <mat-form-field appearance="outline">
              <mat-label>Full name</mat-label>
              <input matInput [(ngModel)]="textValue" placeholder="Enter your name">
            </mat-form-field>
          </div>

          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">With Hint</label>
            <mat-form-field appearance="outline">
              <mat-label>Email address</mat-label>
              <input matInput type="email" placeholder="user&#64;example.com">
              <mat-hint>We'll never share your email</mat-hint>
            </mat-form-field>
          </div>

          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">With Error</label>
            <mat-form-field appearance="outline">
              <mat-label>Username</mat-label>
              <input matInput value="ab" required minlength="3">
              <mat-error>Username must be at least 3 characters</mat-error>
            </mat-form-field>
          </div>

          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">Disabled</label>
            <mat-form-field appearance="outline">
              <mat-label>Disabled field</mat-label>
              <input matInput disabled value="Cannot edit this">
            </mat-form-field>
          </div>
        </div>

        <h3 class="subsection-title">Filled Appearance</h3>
        <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">Default Filled</label>
            <mat-form-field appearance="fill">
              <mat-label>Search</mat-label>
              <input matInput placeholder="Type to search...">
            </mat-form-field>
          </div>

          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">With Prefix Icon</label>
            <mat-form-field appearance="fill">
              <mat-label>Phone number</mat-label>
              <mat-icon matPrefix>phone</mat-icon>
              <input matInput type="tel" placeholder="(555) 123-4567">
            </mat-form-field>
          </div>

          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">With Suffix Icon</label>
            <mat-form-field appearance="fill">
              <mat-label>Password</mat-label>
              <input matInput [type]="hidePassword ? 'password' : 'text'" placeholder="Enter password">
              <mat-icon matSuffix (click)="hidePassword = !hidePassword" style="cursor: pointer;">
                {{ hidePassword ? 'visibility_off' : 'visibility' }}
              </mat-icon>
            </mat-form-field>
          </div>

          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">With Prefix &amp; Suffix</label>
            <mat-form-field appearance="fill">
              <mat-label>Amount</mat-label>
              <span matPrefix>$&nbsp;</span>
              <input matInput type="number" placeholder="0.00">
              <span matSuffix>.00</span>
            </mat-form-field>
          </div>
        </div>

        <div class="token-note">
          <strong>Token mapping:</strong>
          Outline border &rarr; <code>--mj-border-default</code>,
          Hover &rarr; <code>--mj-border-strong</code>,
          Focus &rarr; <code>--mj-border-focus</code>,
          Label text &rarr; <code>--mj-text-secondary</code>,
          Input text &rarr; <code>--mj-text-primary</code>,
          Caret &rarr; <code>--mj-brand-primary</code>
        </div>
      </section>

      <!-- ========================================
           SECTION 2: Textarea
           ======================================== -->
      <section class="section">
        <div class="section-header">
          <h2>Textarea</h2>
          <p class="section-description">
            Multi-line text input using <code>textarea matInput</code>. Uses the same border token
            mappings as text inputs.
          </p>
        </div>

        <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">Default</label>
            <mat-form-field appearance="outline">
              <mat-label>Description</mat-label>
              <textarea matInput [(ngModel)]="textareaValue" rows="4"
                        placeholder="Enter a description..."></textarea>
            </mat-form-field>
          </div>

          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">With Character Counter</label>
            <mat-form-field appearance="outline">
              <mat-label>Bio</mat-label>
              <textarea matInput #bioInput maxlength="200" rows="4"
                        placeholder="Tell us about yourself..."></textarea>
              <mat-hint align="end">{{ bioInput.value.length }} / 200</mat-hint>
            </mat-form-field>
          </div>

          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">Auto-resize</label>
            <mat-form-field appearance="outline">
              <mat-label>Notes</mat-label>
              <textarea matInput cdkTextareaAutosize cdkAutosizeMinRows="2" cdkAutosizeMaxRows="8"
                        placeholder="This textarea grows as you type..."></textarea>
            </mat-form-field>
          </div>
        </div>

        <div class="token-note">
          <strong>Token mapping:</strong>
          Same border tokens as text inputs &mdash;
          <code>--mj-border-default</code>, <code>--mj-border-focus</code>
        </div>
      </section>

      <!-- ========================================
           SECTION 3: Checkboxes
           ======================================== -->
      <section class="section">
        <div class="section-header">
          <h2>Checkboxes</h2>
          <p class="section-description">
            Material checkboxes with checked, unchecked, indeterminate, and disabled states.
          </p>
        </div>

        <div class="selection-grid mj-grid mj-gap-5">
          <div class="selection-item mj-grid mj-flex-column">
            <mat-checkbox [(ngModel)]="checkA">Checked</mat-checkbox>
            <span class="state-label">checked: {{ checkA }}</span>
          </div>

          <div class="selection-item mj-grid mj-flex-column">
            <mat-checkbox [(ngModel)]="checkB">Unchecked</mat-checkbox>
            <span class="state-label">checked: {{ checkB }}</span>
          </div>

          <div class="selection-item mj-grid mj-flex-column">
            <mat-checkbox [indeterminate]="checkIndeterminate"
                          (change)="checkIndeterminate = false">
              Indeterminate
            </mat-checkbox>
            <span class="state-label">indeterminate: {{ checkIndeterminate }}</span>
          </div>

          <div class="selection-item mj-grid mj-flex-column">
            <mat-checkbox disabled [checked]="true">Disabled (checked)</mat-checkbox>
            <span class="state-label">disabled</span>
          </div>

          <div class="selection-item mj-grid mj-flex-column">
            <mat-checkbox disabled>Disabled (unchecked)</mat-checkbox>
            <span class="state-label">disabled</span>
          </div>
        </div>

        <div class="token-note">
          <strong>Token mapping:</strong>
          Checked fill &rarr; <code>--mj-brand-primary</code>,
          Checkmark &rarr; <code>--mj-brand-on-primary</code>,
          Unchecked border &rarr; <code>--mj-text-muted</code>,
          Hover &rarr; <code>--mj-brand-primary-hover</code>
        </div>
      </section>

      <!-- ========================================
           SECTION 4: Radio Buttons
           ======================================== -->
      <section class="section">
        <div class="section-header">
          <h2>Radio Buttons</h2>
          <p class="section-description">
            Radio button group with mutually exclusive options.
          </p>
        </div>

        <div class="selection-grid mj-grid mj-gap-5">
          <mat-radio-group [(ngModel)]="selectedRadio" class="mj-grid mj-gap-4">
            @for (option of radioOptions; track option.value) {
              <div class="selection-item mj-grid mj-flex-column">
                <mat-radio-button [value]="option.value">{{ option.label }}</mat-radio-button>
              </div>
            }
          </mat-radio-group>
        </div>

        <p class="state-display">Selected: <strong>{{ selectedRadio }}</strong></p>

        <h3 class="subsection-title">Disabled Radio Group</h3>
        <div class="selection-grid mj-grid mj-gap-5">
          <mat-radio-group value="disabled1" class="mj-grid mj-gap-4" disabled>
            <div class="selection-item mj-grid mj-flex-column">
              <mat-radio-button value="disabled1">Option A (selected, disabled)</mat-radio-button>
            </div>
            <div class="selection-item mj-grid mj-flex-column">
              <mat-radio-button value="disabled2">Option B (disabled)</mat-radio-button>
            </div>
          </mat-radio-group>
        </div>

        <div class="token-note">
          <strong>Token mapping:</strong>
          Selected dot &rarr; <code>--mj-brand-primary</code>,
          Unselected ring &rarr; <code>--mj-text-muted</code>,
          Hover &rarr; <code>--mj-brand-primary-hover</code>
        </div>
      </section>

      <!-- ========================================
           SECTION 5: Slide Toggle
           ======================================== -->
      <section class="section">
        <div class="section-header">
          <h2>Slide Toggle</h2>
          <p class="section-description">
            On/off toggles for binary settings. The active track color maps to the brand primary.
          </p>
        </div>

        <div class="selection-grid mj-grid mj-gap-5">
          <div class="selection-item toggle-row mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
            <mat-slide-toggle [(ngModel)]="toggleA">Notifications</mat-slide-toggle>
            <span class="state-label">{{ toggleA ? 'On' : 'Off' }}</span>
          </div>

          <div class="selection-item toggle-row mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
            <mat-slide-toggle [(ngModel)]="toggleB">Dark mode</mat-slide-toggle>
            <span class="state-label">{{ toggleB ? 'On' : 'Off' }}</span>
          </div>

          <div class="selection-item toggle-row mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
            <mat-slide-toggle disabled [checked]="true">Disabled (on)</mat-slide-toggle>
            <span class="state-label">disabled</span>
          </div>

          <div class="selection-item toggle-row mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
            <mat-slide-toggle disabled>Disabled (off)</mat-slide-toggle>
            <span class="state-label">disabled</span>
          </div>
        </div>

        <div class="token-note">
          <strong>Token mapping:</strong>
          Active track &rarr; <code>--mj-brand-primary</code>,
          Handle &rarr; <code>--mj-brand-on-primary</code>,
          Hover track &rarr; <code>--mj-brand-primary-hover</code>
        </div>
      </section>

      <!-- ========================================
           SECTION 6: Slider
           ======================================== -->
      <section class="section">
        <div class="section-header">
          <h2>Slider</h2>
          <p class="section-description">
            Continuous and discrete sliders for selecting values from a range.
          </p>
        </div>

        <div class="slider-grid mj-grid mj-flex-column mj-gap-6">
          <div class="slider-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">Continuous (value: {{ sliderValue }})</label>
            <mat-slider min="0" max="100" step="1">
              <input matSliderThumb [(ngModel)]="sliderValue">
            </mat-slider>
          </div>

          <div class="slider-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">Discrete with Thumb Label (value: {{ discreteSliderValue }})</label>
            <mat-slider min="0" max="100" step="10" discrete [displayWith]="FormatSliderLabel">
              <input matSliderThumb [(ngModel)]="discreteSliderValue">
            </mat-slider>
          </div>

          <div class="slider-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">Range ({{ rangeStart }} - {{ rangeEnd }})</label>
            <mat-slider min="0" max="100" step="1">
              <input matSliderStartThumb [(ngModel)]="rangeStart">
              <input matSliderEndThumb [(ngModel)]="rangeEnd">
            </mat-slider>
          </div>

          <div class="slider-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">Disabled</label>
            <mat-slider min="0" max="100" step="1" disabled>
              <input matSliderThumb value="60">
            </mat-slider>
          </div>
        </div>

        <div class="token-note">
          <strong>Token mapping:</strong>
          Active track &rarr; <code>--mj-brand-primary</code>,
          Handle &rarr; <code>--mj-brand-primary</code>,
          Inactive track &rarr; <code>--mj-border-default</code>,
          Hover handle &rarr; <code>--mj-brand-primary-hover</code>
        </div>
      </section>

      <!-- ========================================
           SECTION 7: Datepicker
           ======================================== -->
      <section class="section">
        <div class="section-header">
          <h2>Datepicker</h2>
          <p class="section-description">
            Date selection using <code>mat-datepicker</code> with calendar popup.
          </p>
        </div>

        <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">Basic Datepicker</label>
            <mat-form-field appearance="outline">
              <mat-label>Choose a date</mat-label>
              <input matInput [matDatepicker]="basicPicker" [(ngModel)]="selectedDate">
              <mat-datepicker-toggle matIconSuffix [for]="basicPicker"></mat-datepicker-toggle>
              <mat-datepicker #basicPicker></mat-datepicker>
            </mat-form-field>
          </div>

          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">With Min/Max Dates</label>
            <mat-form-field appearance="outline">
              <mat-label>Select date (restricted)</mat-label>
              <input matInput [matDatepicker]="rangePicker"
                     [min]="minDate" [max]="maxDate">
              <mat-hint>Between {{ minDate | date:'shortDate' }} and {{ maxDate | date:'shortDate' }}</mat-hint>
              <mat-datepicker-toggle matIconSuffix [for]="rangePicker"></mat-datepicker-toggle>
              <mat-datepicker #rangePicker></mat-datepicker>
            </mat-form-field>
          </div>

          <div class="input-group mj-grid mj-flex-column mj-gap-2">
            <label class="input-label">Disabled</label>
            <mat-form-field appearance="outline">
              <mat-label>Disabled date</mat-label>
              <input matInput [matDatepicker]="disabledPicker" disabled>
              <mat-datepicker-toggle matIconSuffix [for]="disabledPicker"></mat-datepicker-toggle>
              <mat-datepicker #disabledPicker></mat-datepicker>
            </mat-form-field>
          </div>
        </div>

        <p class="state-display">
          Selected date: <strong>{{ selectedDate ? (selectedDate | date:'fullDate') : 'None' }}</strong>
        </p>

        <div class="token-note">
          <strong>Token mapping:</strong>
          Selected date &rarr; <code>--mj-brand-primary</code>,
          Today indicator &rarr; <code>--mj-brand-primary</code>,
          Calendar surface &rarr; <code>--mj-bg-surface-elevated</code>
        </div>
      </section>

    </div>
  `,
    styles: [`
    .form-inputs-page {
        max-width: 900px;
        font-family: var(--mj-font-family);
    }

    /* ========================================
       Section Layout
       ======================================== */
    .section {
        margin-bottom: var(--mj-space-10);
    }

    .section-header {
        margin-bottom: var(--mj-space-5);

        h2 {
            margin: 0 0 var(--mj-space-2) 0;
            font-size: var(--mj-text-2xl);
            font-weight: var(--mj-font-bold);
            color: var(--mj-text-primary);
        }
    }

    .section-description {
        margin: 0;
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);
        line-height: var(--mj-leading-relaxed);

        code {
            background-color: var(--mj-bg-surface-sunken);
            padding: var(--mj-space-0-5) var(--mj-space-1-5);
            border-radius: var(--mj-radius-sm);
            font-family: var(--mj-font-family-mono);
            font-size: var(--mj-text-xs);
            color: var(--mj-brand-primary);
        }
    }

    .subsection-title {
        margin: var(--mj-space-6) 0 var(--mj-space-3) 0;
        font-size: var(--mj-text-base);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
    }

    /* ========================================
       Input Grid (for text inputs, textarea, datepicker)
       ======================================== */

    .input-label {
        font-size: var(--mj-text-xs);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--mj-tracking-wide);
    }

    .input-group mat-form-field {
        width: 100%;
    }

    /* ========================================
       Selection Grid (for checkboxes, radios, toggles)
       ======================================== */
    .selection-grid {
        padding: var(--mj-space-4);
        background-color: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-lg);
    }

    .selection-item {
        min-width: 160px;
    }

    .toggle-row {
        min-width: 200px;
    }

    .state-label {
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
        font-family: var(--mj-font-family-mono);
    }

    .state-display {
        margin-top: var(--mj-space-3);
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);

        strong {
            color: var(--mj-brand-primary);
            font-family: var(--mj-font-family-mono);
        }
    }

    /* ========================================
       Slider Grid
       ======================================== */
    .slider-grid {
        padding: var(--mj-space-4);
        background-color: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-lg);
    }

    .slider-group {
        mat-slider {
            width: 100%;
        }
    }

    /* ========================================
       Token Note
       ======================================== */
    .token-note {
        margin-top: var(--mj-space-4);
        padding: var(--mj-space-3) var(--mj-space-4);
        background-color: var(--mj-bg-surface-sunken);
        border-radius: var(--mj-radius-md);
        font-size: var(--mj-text-xs);
        color: var(--mj-text-secondary);
        line-height: var(--mj-leading-relaxed);
        border-left: 3px solid var(--mj-brand-primary);

        strong {
            color: var(--mj-text-primary);
        }

        code {
            background-color: var(--mj-bg-surface);
            padding: var(--mj-space-0-5) var(--mj-space-1-5);
            border-radius: var(--mj-radius-sm);
            font-family: var(--mj-font-family-mono);
            font-size: var(--mj-text-xs);
            color: var(--mj-brand-primary);
        }
    }
  `]
})
export class FormInputsComponent {
    /* Text Inputs */
    textValue = '';
    hidePassword = true;

    /* Textarea */
    textareaValue = '';

    /* Checkboxes */
    checkA = true;
    checkB = false;
    checkIndeterminate = true;

    /* Radio Buttons */
    selectedRadio = 'option1';
    radioOptions = [
        { value: 'option1', label: 'Standard plan' },
        { value: 'option2', label: 'Professional plan' },
        { value: 'option3', label: 'Enterprise plan' }
    ];

    /* Slide Toggle */
    toggleA = true;
    toggleB = false;

    /* Slider */
    sliderValue = 40;
    discreteSliderValue = 50;
    rangeStart = 20;
    rangeEnd = 80;

    /* Datepicker */
    selectedDate: Date | null = null;
    minDate = new Date(new Date().getFullYear(), 0, 1);
    maxDate = new Date(new Date().getFullYear(), 11, 31);

    FormatSliderLabel(value: number): string {
        return `${value}`;
    }
}
