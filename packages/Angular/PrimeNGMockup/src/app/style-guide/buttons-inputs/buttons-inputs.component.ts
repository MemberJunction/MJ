import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TextareaModule } from 'primeng/textarea';
import { SplitButtonModule } from 'primeng/splitbutton';
import { SpeedDialModule } from 'primeng/speeddial';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputMaskModule } from 'primeng/inputmask';
import { InputOtpModule } from 'primeng/inputotp';
import { PasswordModule } from 'primeng/password';
import { ChipModule } from 'primeng/chip';
import { FloatLabelModule } from 'primeng/floatlabel';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { KeyFilterModule } from 'primeng/keyfilter';
import { ButtonGroupModule } from 'primeng/buttongroup';
import { IftaLabelModule } from 'primeng/iftalabel';
import { FluidModule } from 'primeng/fluid';
import { MenuItem } from 'primeng/api';

interface DropdownOption {
    label: string;
    value: string;
}

interface AutoCompleteEvent {
    query: string;
}

@Component({
    selector: 'app-buttons-inputs',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        InputTextModule,
        SelectModule,
        CheckboxModule,
        RadioButtonModule,
        ToggleSwitchModule,
        TextareaModule,
        SplitButtonModule,
        SpeedDialModule,
        AutoCompleteModule,
        InputNumberModule,
        InputMaskModule,
        InputOtpModule,
        PasswordModule,
        ChipModule,
        FloatLabelModule,
        IconFieldModule,
        InputIconModule,
        InputGroupModule,
        InputGroupAddonModule,
        KeyFilterModule,
        ButtonGroupModule,
        IftaLabelModule,
        FluidModule
    ],
    template: `
    <div class="buttons-inputs-page">
        <!-- Buttons Section -->
        <section class="token-section">
            <h2>Buttons</h2>
            <p class="section-desc">PrimeNG buttons styled with MJ design tokens. All variants derive color from the token bridge.</p>

            <!-- Primary Buttons -->
            <h3 class="subsection-title">Primary</h3>
            <p class="subsection-desc">Token mapping: background &#8594; --mj-brand-primary, text &#8594; --mj-brand-on-primary</p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button pButton label="Primary" class="p-button-primary"></button>
                <button pButton label="Primary" icon="pi pi-check" class="p-button-primary"></button>
                <button pButton icon="pi pi-search" class="p-button-primary p-button-icon-only"></button>
                <button pButton label="Disabled" class="p-button-primary" [disabled]="true"></button>
            </div>

            <!-- Secondary Buttons -->
            <h3 class="subsection-title">Secondary</h3>
            <p class="subsection-desc">Token mapping: border &#8594; --mj-border-default, bg &#8594; --mj-bg-surface</p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button pButton label="Secondary" class="p-button-secondary"></button>
                <button pButton label="Secondary" icon="pi pi-cog" class="p-button-secondary"></button>
            </div>

            <!-- Outlined Buttons -->
            <h3 class="subsection-title">Outlined</h3>
            <p class="subsection-desc">Token mapping: border & text &#8594; --mj-brand-primary</p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button pButton label="Outlined" class="p-button-outlined"></button>
                <button pButton label="Outlined" icon="pi pi-download" class="p-button-outlined"></button>
            </div>

            <!-- Text Buttons -->
            <h3 class="subsection-title">Text</h3>
            <p class="subsection-desc">Token mapping: text &#8594; --mj-brand-primary, hover bg &#8594; 8% brand mix</p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button pButton label="Text Button" class="p-button-text"></button>
                <button pButton label="Text" icon="pi pi-plus" class="p-button-text"></button>
            </div>

            <!-- Status Buttons -->
            <h3 class="subsection-title">Status Variants</h3>
            <p class="subsection-desc">Token mapping: success/warning/danger &#8594; --mj-status-* tokens</p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button pButton label="Success" class="p-button-success"></button>
                <button pButton label="Warning" class="p-button-warning"></button>
                <button pButton label="Danger" class="p-button-danger"></button>
            </div>

            <!-- Button Sizes -->
            <h3 class="subsection-title">Sizes</h3>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <button pButton label="Small" class="p-button-primary p-button-sm"></button>
                <button pButton label="Normal" class="p-button-primary"></button>
                <button pButton label="Large" class="p-button-primary p-button-lg"></button>
            </div>
        </section>

        <!-- SplitButton Section -->
        <section class="token-section">
            <h2>SplitButton</h2>
            <p class="section-desc">Button with an attached dropdown for additional actions.</p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <p-splitButton label="Save" icon="pi pi-check" [model]="splitItems" styleClass="p-button-primary"></p-splitButton>
                <p-splitButton label="Actions" icon="pi pi-cog" [model]="splitItems" styleClass="p-button-secondary"></p-splitButton>
                <p-splitButton label="Outlined" icon="pi pi-download" [model]="splitItems" styleClass="p-button-outlined"></p-splitButton>
            </div>
        </section>

        <!-- ButtonGroup Section -->
        <section class="token-section">
            <h2>ButtonGroup</h2>
            <p class="section-desc">Groups related buttons visually into a single unit with shared borders. Uses MJ brand tokens for consistent styling.</p>
            <p class="token-mapping">Background: --mj-brand-primary | Border shared between grouped buttons</p>

            <div class="component-row mj-grid mj-gap-5 mj-align-center">
                <p-buttonGroup>
                    <button pButton label="Save" icon="pi pi-check" class="p-button-primary"></button>
                    <button pButton label="Edit" icon="pi pi-pencil" class="p-button-primary"></button>
                    <button pButton label="Delete" icon="pi pi-trash" class="p-button-primary"></button>
                </p-buttonGroup>
                <p-buttonGroup>
                    <button pButton label="Left" icon="pi pi-align-left" class="p-button-outlined"></button>
                    <button pButton label="Center" icon="pi pi-align-center" class="p-button-outlined"></button>
                    <button pButton label="Right" icon="pi pi-align-right" class="p-button-outlined"></button>
                </p-buttonGroup>
            </div>
        </section>

        <!-- SpeedDial Section -->
        <section class="token-section">
            <h2>SpeedDial</h2>
            <p class="section-desc">Floating action button that reveals multiple actions. Uses --mj-brand-primary for the trigger.</p>
            <div class="speed-dial-container">
                <p-speedDial [model]="speedDialItems" direction="right" [style]="{ position: 'relative' }"></p-speedDial>
            </div>
        </section>

        <!-- Text Inputs Section -->
        <section class="token-section">
            <h2>Text Inputs</h2>
            <p class="section-desc">PrimeNG input fields with MJ token-based borders, focus rings, and spacing.</p>

            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Default</label>
                    <input type="text" pInputText placeholder="Enter text..." />
                    <span class="token-hint">border: --mj-border-default, focus: --mj-border-focus</span>
                </div>

                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Disabled</label>
                    <input type="text" pInputText placeholder="Disabled input" [disabled]="true" />
                </div>

                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>With Value</label>
                    <input type="text" pInputText value="Sample value" />
                </div>
            </div>
        </section>

        <!-- AutoComplete Section -->
        <section class="token-section">
            <h2>AutoComplete</h2>
            <p class="section-desc">Typeahead input with suggestion dropdown.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Basic AutoComplete</label>
                    <p-autoComplete [(ngModel)]="autoCompleteValue" [suggestions]="filteredItems" (completeMethod)="FilterItems($event)" placeholder="Type a fruit..."></p-autoComplete>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Multiple</label>
                    <p-autoComplete [(ngModel)]="autoCompleteMultiple" [suggestions]="filteredItems" (completeMethod)="FilterItems($event)" [multiple]="true" placeholder="Add items..."></p-autoComplete>
                </div>
            </div>
        </section>

        <!-- InputNumber Section -->
        <section class="token-section">
            <h2>InputNumber</h2>
            <p class="section-desc">Numeric input with increment/decrement and formatting.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Integer</label>
                    <p-inputNumber [(ngModel)]="numericValue" [showButtons]="true" [min]="0" [max]="100"></p-inputNumber>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Currency</label>
                    <p-inputNumber [(ngModel)]="currencyValue" mode="currency" currency="USD" locale="en-US"></p-inputNumber>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Percentage</label>
                    <p-inputNumber [(ngModel)]="percentValue" suffix="%" [min]="0" [max]="100"></p-inputNumber>
                </div>
            </div>
        </section>

        <!-- InputMask Section -->
        <section class="token-section">
            <h2>InputMask</h2>
            <p class="section-desc">Masked text input for formatted values (phone, date, serial numbers).</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Phone</label>
                    <p-inputMask mask="(999) 999-9999" placeholder="(999) 999-9999" [(ngModel)]="phoneMask"></p-inputMask>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Date</label>
                    <p-inputMask mask="99/99/9999" placeholder="MM/DD/YYYY" [(ngModel)]="dateMask"></p-inputMask>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Serial Number</label>
                    <p-inputMask mask="a*-999-a999" placeholder="a*-999-a999" [(ngModel)]="serialMask"></p-inputMask>
                </div>
            </div>
        </section>

        <!-- InputOtp Section -->
        <section class="token-section">
            <h2>InputOtp</h2>
            <p class="section-desc">One-time password input with individual character fields.</p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <p-inputOtp [(ngModel)]="otpValue" [length]="6"></p-inputOtp>
            </div>
        </section>

        <!-- Password Section -->
        <section class="token-section">
            <h2>Password</h2>
            <p class="section-desc">Password input with strength meter and toggle visibility.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Basic Password</label>
                    <p-password [(ngModel)]="passwordValue" [toggleMask]="true" [feedback]="false" placeholder="Enter password"></p-password>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>With Strength Meter</label>
                    <p-password [(ngModel)]="passwordStrength" [toggleMask]="true" placeholder="Enter password"></p-password>
                </div>
            </div>
        </section>

        <!-- Chips Section -->
        <section class="token-section">
            <h2>Chips</h2>
            <p class="section-desc">Chip components for displaying tags and labels. Supports icons and removable chips.</p>
            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                @for (chip of chipValues; track chip) {
                    <p-chip [label]="chip" [removable]="true" (onRemove)="OnChipRemove(chip)"></p-chip>
                }
            </div>
        </section>

        <!-- FloatLabel Section -->
        <section class="token-section">
            <h2>FloatLabel</h2>
            <p class="section-desc">Labels that float above inputs when focused or filled.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <p-floatLabel>
                        <input pInputText id="float-name" [(ngModel)]="floatName" />
                        <label for="float-name">Full Name</label>
                    </p-floatLabel>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <p-floatLabel>
                        <input pInputText id="float-email" [(ngModel)]="floatEmail" />
                        <label for="float-email">Email Address</label>
                    </p-floatLabel>
                </div>
            </div>
        </section>

        <!-- IftaLabel Section -->
        <section class="token-section">
            <h2>IftaLabel</h2>
            <p class="section-desc">Inline floating top-aligned label. An alternative to FloatLabel that keeps the label inside the field border at the top edge.</p>
            <p class="token-mapping">Label: --mj-text-muted (inactive) &#8594; --mj-brand-primary (focused) | Border: --mj-border-default</p>

            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <p-iftalabel>
                        <input pInputText id="ifta-username" [(ngModel)]="iftaUsername" />
                        <label for="ifta-username">Username</label>
                    </p-iftalabel>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <p-iftalabel>
                        <input pInputText id="ifta-email" [(ngModel)]="iftaEmail" />
                        <label for="ifta-email">Email Address</label>
                    </p-iftalabel>
                </div>
            </div>
        </section>

        <!-- Fluid Section -->
        <section class="token-section">
            <h2>Fluid</h2>
            <p class="section-desc">Responsive layout wrapper that makes descendant form components span the full width of their container.</p>
            <p class="token-mapping">Applies width: 100% to PrimeNG form components via the p-fluid CSS scope</p>

            <div class="fluid-demo">
                <p-fluid>
                    <div class="mj-grid mj-flex-column mj-gap-4">
                        <input pInputText placeholder="Full-width input inside p-fluid" />
                        <p-select [options]="dropdownOptions" placeholder="Full-width dropdown" [style]="{'width': '100%'}"></p-select>
                        <textarea pInputTextarea rows="3" placeholder="Full-width textarea"></textarea>
                    </div>
                </p-fluid>
            </div>
        </section>

        <!-- IconField Section -->
        <section class="token-section">
            <h2>IconField &amp; InputIcon</h2>
            <p class="section-desc">Inputs with embedded icons on the left or right side.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Left Icon</label>
                    <p-iconField iconPosition="left">
                        <p-inputIcon styleClass="pi pi-search"></p-inputIcon>
                        <input pInputText placeholder="Search..." />
                    </p-iconField>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Right Icon</label>
                    <p-iconField iconPosition="right">
                        <p-inputIcon styleClass="pi pi-spin pi-spinner"></p-inputIcon>
                        <input pInputText placeholder="Loading..." />
                    </p-iconField>
                </div>
            </div>
        </section>

        <!-- InputGroup Section -->
        <section class="token-section">
            <h2>InputGroup</h2>
            <p class="section-desc">Input fields grouped with addons (text, icons, buttons).</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>With Icon Addon</label>
                    <p-inputGroup>
                        <p-inputGroupAddon><i class="pi pi-user"></i></p-inputGroupAddon>
                        <input pInputText placeholder="Username" />
                    </p-inputGroup>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>With Text Addon</label>
                    <p-inputGroup>
                        <p-inputGroupAddon>$</p-inputGroupAddon>
                        <input pInputText placeholder="Amount" />
                        <p-inputGroupAddon>.00</p-inputGroupAddon>
                    </p-inputGroup>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>With Button</label>
                    <p-inputGroup>
                        <input pInputText placeholder="Search..." />
                        <button pButton icon="pi pi-search" class="p-button-primary"></button>
                    </p-inputGroup>
                </div>
            </div>
        </section>

        <!-- KeyFilter Section -->
        <section class="token-section">
            <h2>KeyFilter</h2>
            <p class="section-desc">Directive that restricts input to certain character patterns.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Integers Only</label>
                    <input pInputText pKeyFilter="int" placeholder="Type numbers only" />
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Alphabetic Only</label>
                    <input pInputText pKeyFilter="alpha" placeholder="Type letters only" />
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Hex Values</label>
                    <input pInputText pKeyFilter="hex" placeholder="Type hex chars" />
                </div>
            </div>
        </section>

        <!-- Textarea Section -->
        <section class="token-section">
            <h2>Textarea</h2>
            <p class="section-desc">Multi-line input using the same token-based styling as text inputs.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Default Textarea</label>
                    <textarea pInputTextarea rows="4" placeholder="Enter longer text here..."></textarea>
                    <span class="token-hint">Shares --mj-border-* and --mj-radius-md with text inputs</span>
                </div>
            </div>
        </section>

        <!-- Dropdown Section -->
        <section class="token-section">
            <h2>Dropdown</h2>
            <p class="section-desc">PrimeNG dropdown with MJ-themed borders, surfaces, and hover states.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Basic Dropdown</label>
                    <p-select
                        [options]="dropdownOptions"
                        [(ngModel)]="selectedDropdown"
                        placeholder="Select an option"
                        [style]="{'width': '100%'}">
                    </p-select>
                    <span class="token-hint">Panel bg: --mj-bg-surface-elevated</span>
                </div>
            </div>
        </section>

        <!-- Checkbox & Radio Section -->
        <section class="token-section">
            <h2>Checkbox & Radio</h2>
            <p class="section-desc">Selection controls with MJ brand colors for checked state.</p>

            <div class="selection-grid mj-row mj-row-cols-md-2 mj-gap-8">
                <div class="selection-group">
                    <h3 class="subsection-title">Checkboxes</h3>
                    <p class="subsection-desc">Checked state: --mj-brand-primary</p>
                    <div class="selection-row mj-grid mj-flex-nowrap mj-gap-2 mj-align-center">
                        <p-checkbox [(ngModel)]="checkA" [binary]="true" inputId="check-a"></p-checkbox>
                        <label for="check-a">Option A (checked)</label>
                    </div>
                    <div class="selection-row mj-grid mj-flex-nowrap mj-gap-2 mj-align-center">
                        <p-checkbox [(ngModel)]="checkB" [binary]="true" inputId="check-b"></p-checkbox>
                        <label for="check-b">Option B</label>
                    </div>
                    <div class="selection-row mj-grid mj-flex-nowrap mj-gap-2 mj-align-center">
                        <p-checkbox [binary]="true" [disabled]="true" inputId="check-disabled"></p-checkbox>
                        <label for="check-disabled">Disabled</label>
                    </div>
                </div>

                <div class="selection-group">
                    <h3 class="subsection-title">Radio Buttons</h3>
                    <p class="subsection-desc">Selected state: --mj-brand-primary</p>
                    <div class="selection-row mj-grid mj-flex-nowrap mj-gap-2 mj-align-center">
                        <p-radioButton name="radio" value="A" [(ngModel)]="selectedRadio" inputId="radio-a"></p-radioButton>
                        <label for="radio-a">Option A</label>
                    </div>
                    <div class="selection-row mj-grid mj-flex-nowrap mj-gap-2 mj-align-center">
                        <p-radioButton name="radio" value="B" [(ngModel)]="selectedRadio" inputId="radio-b"></p-radioButton>
                        <label for="radio-b">Option B</label>
                    </div>
                    <div class="selection-row mj-grid mj-flex-nowrap mj-gap-2 mj-align-center">
                        <p-radioButton name="radio" value="C" [(ngModel)]="selectedRadio" inputId="radio-c"></p-radioButton>
                        <label for="radio-c">Option C</label>
                    </div>
                </div>
            </div>
        </section>

        <!-- Input Switch -->
        <section class="token-section">
            <h2>Input Switch</h2>
            <p class="section-desc">Toggle switch with MJ brand primary color when active.</p>
            <div class="component-row mj-grid mj-gap-8 mj-align-center">
                <div class="switch-group mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                    <p-toggleswitch [(ngModel)]="switchA"></p-toggleswitch>
                    <span>{{ switchA ? 'On' : 'Off' }}</span>
                </div>
                <div class="switch-group mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                    <p-toggleswitch [(ngModel)]="switchB"></p-toggleswitch>
                    <span>{{ switchB ? 'Enabled' : 'Disabled' }}</span>
                </div>
            </div>
        </section>
    </div>
  `,
    styles: [`
    .buttons-inputs-page {
        max-width: 900px;
    }

    .token-section {
        margin-bottom: var(--mj-space-10);
    }

    .token-section h2 {
        font-size: var(--mj-text-2xl);
        font-weight: var(--mj-font-bold);
        color: var(--mj-text-primary);
        margin: 0 0 var(--mj-space-2) 0;
    }

    .section-desc {
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        margin: 0 0 var(--mj-space-5) 0;
        line-height: var(--mj-leading-relaxed);
    }

    .subsection-title {
        font-size: var(--mj-text-base);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
        margin: var(--mj-space-5) 0 var(--mj-space-1) 0;
    }

    .subsection-desc {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
        margin: 0 0 var(--mj-space-3) 0;
    }

    .component-row {
        margin-bottom: var(--mj-space-4);
    }

    /* Input Grid */

    .input-group {
        label {
            font-size: var(--mj-text-sm);
            font-weight: var(--mj-font-medium);
            color: var(--mj-text-primary);
        }

        input, textarea {
            width: 100%;
        }
    }

    .token-hint {
        font-family: var(--mj-font-family-mono);
        font-size: 10px;
        color: var(--mj-text-muted);
    }

    /* Selection Controls */

    .selection-row {
        padding: var(--mj-space-1) 0;

        label {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-primary);
            cursor: pointer;
        }
    }

    .switch-group {
        span {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
        }
    }

    .token-mapping {
        font-family: var(--mj-font-family-mono);
        font-size: 11px;
        color: var(--mj-text-muted);
        margin: 0 0 var(--mj-space-5) 0;
    }

    .fluid-demo {
        padding: var(--mj-space-4);
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-lg);
    }

    .speed-dial-container {
        height: 80px;
        position: relative;
        display: flex;
        align-items: center;
        padding-left: var(--mj-space-3);
    }
  `]
})
export class ButtonsInputsComponent {
    dropdownOptions: DropdownOption[] = [
        { label: 'Option 1', value: 'opt1' },
        { label: 'Option 2', value: 'opt2' },
        { label: 'Option 3', value: 'opt3' },
        { label: 'Option 4', value: 'opt4' }
    ];

    splitItems: MenuItem[] = [
        { label: 'Update', icon: 'pi pi-refresh' },
        { label: 'Delete', icon: 'pi pi-trash' },
        { label: 'Export', icon: 'pi pi-upload' }
    ];

    speedDialItems: MenuItem[] = [
        { icon: 'pi pi-pencil', tooltipOptions: { tooltipLabel: 'Edit' } },
        { icon: 'pi pi-trash', tooltipOptions: { tooltipLabel: 'Delete' } },
        { icon: 'pi pi-search', tooltipOptions: { tooltipLabel: 'Search' } },
        { icon: 'pi pi-upload', tooltipOptions: { tooltipLabel: 'Upload' } }
    ];

    allItems: string[] = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape', 'Honeydew'];
    filteredItems: string[] = [];
    autoCompleteValue: string | null = null;
    autoCompleteMultiple: string[] = [];

    numericValue: number | null = 25;
    currencyValue: number | null = 1500;
    percentValue: number | null = 75;

    phoneMask: string | null = null;
    dateMask: string | null = null;
    serialMask: string | null = null;

    otpValue: string | null = null;
    passwordValue: string | null = null;
    passwordStrength: string | null = null;
    chipValues: string[] = ['Angular', 'PrimeNG', 'TypeScript'];

    OnChipRemove(chip: string) {
        this.chipValues = this.chipValues.filter(c => c !== chip);
    }

    floatName: string | null = null;
    floatEmail: string | null = null;
    iftaUsername: string | null = null;
    iftaEmail: string | null = null;

    selectedDropdown: string | null = null;
    checkA = true;
    checkB = false;
    selectedRadio = 'A';
    switchA = true;
    switchB = false;

    FilterItems(event: AutoCompleteEvent) {
        const query = event.query.toLowerCase();
        this.filteredItems = this.allItems.filter(item => item.toLowerCase().includes(query));
    }
}
