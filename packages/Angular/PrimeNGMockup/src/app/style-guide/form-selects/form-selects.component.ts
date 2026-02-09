import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { ListboxModule } from 'primeng/listbox';
import { CascadeSelectModule } from 'primeng/cascadeselect';
import { TreeSelectModule } from 'primeng/treeselect';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { RatingModule } from 'primeng/rating';
import { SliderModule } from 'primeng/slider';
import { KnobModule } from 'primeng/knob';
import { ColorPickerModule } from 'primeng/colorpicker';
import { DatePickerModule } from 'primeng/datepicker';
import { EditorModule } from 'primeng/editor';
import { TreeNode } from 'primeng/api';

interface SelectOption {
    label: string;
    value: string;
}

interface CascadeOption {
    name: string;
    code: string;
    states?: { name: string; code: string; cities?: { name: string; code: string }[] }[];
}

@Component({
    selector: 'app-form-selects',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MultiSelectModule,
        ListboxModule,
        CascadeSelectModule,
        TreeSelectModule,
        SelectButtonModule,
        ToggleButtonModule,
        RatingModule,
        SliderModule,
        KnobModule,
        ColorPickerModule,
        DatePickerModule,
        EditorModule
    ],
    template: `
    <div class="form-selects-page">
        <!-- MultiSelect Section -->
        <section class="token-section">
            <h2>MultiSelect</h2>
            <p class="section-desc">Dropdown that allows selecting multiple items with checkboxes, chips display, and filtering.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Basic MultiSelect</label>
                    <p-multiSelect
                        [options]="cities"
                        [(ngModel)]="selectedCities"
                        placeholder="Select Cities"
                        [style]="{'width': '100%'}">
                    </p-multiSelect>
                    <span class="token-hint">Panel bg: --mj-bg-surface-elevated</span>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>With Max Selected Labels</label>
                    <p-multiSelect
                        [options]="cities"
                        [(ngModel)]="selectedCitiesChip"
                        placeholder="Select Cities"
                        [maxSelectedLabels]="3"
                        [style]="{'width': '100%'}">
                    </p-multiSelect>
                </div>
            </div>
        </section>

        <!-- Listbox Section -->
        <section class="token-section">
            <h2>Listbox</h2>
            <p class="section-desc">A list-based selection component supporting single and multiple selection with keyboard navigation.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Single Selection</label>
                    <p-listbox
                        [options]="cities"
                        [(ngModel)]="selectedListboxCity"
                        [style]="{'width': '100%'}"
                        [listStyle]="{'max-height': '180px'}">
                    </p-listbox>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Multiple Selection</label>
                    <p-listbox
                        [options]="cities"
                        [(ngModel)]="selectedListboxCities"
                        [multiple]="true"
                        [checkbox]="true"
                        [style]="{'width': '100%'}"
                        [listStyle]="{'max-height': '180px'}">
                    </p-listbox>
                </div>
            </div>
        </section>

        <!-- CascadeSelect Section -->
        <section class="token-section">
            <h2>CascadeSelect</h2>
            <p class="section-desc">Hierarchical dropdown for selecting nested options such as country, state, and city.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Country / State / City</label>
                    <p-cascadeSelect
                        [options]="$any(cascadeCountries)"
                        [(ngModel)]="selectedCascade"
                        optionLabel="name"
                        optionGroupLabel="name"
                        [optionGroupChildren]="['states', 'cities']"
                        placeholder="Select a Location"
                        [style]="{'width': '100%'}">
                    </p-cascadeSelect>
                    <span class="token-hint">Nested panels use --mj-bg-surface-elevated</span>
                </div>
            </div>
        </section>

        <!-- TreeSelect Section -->
        <section class="token-section">
            <h2>TreeSelect</h2>
            <p class="section-desc">Tree-based selection dropdown with expandable nodes, ideal for hierarchical data.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Single Selection</label>
                    <p-treeSelect
                        [options]="treeNodes"
                        [(ngModel)]="selectedTreeNode"
                        placeholder="Select an Item"
                        [style]="{'width': '100%'}">
                    </p-treeSelect>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Checkbox Selection</label>
                    <p-treeSelect
                        [options]="treeNodes"
                        [(ngModel)]="selectedTreeNodes"
                        selectionMode="checkbox"
                        placeholder="Select Items"
                        [style]="{'width': '100%'}">
                    </p-treeSelect>
                </div>
            </div>
        </section>

        <!-- SelectButton Section -->
        <section class="token-section">
            <h2>SelectButton</h2>
            <p class="section-desc">A group of toggle buttons for single or multiple selection, often used as a segmented control.</p>
            <div class="component-row mj-grid mj-gap-3">
                <p-selectButton [options]="viewOptions" [(ngModel)]="selectedView" optionLabel="label" optionValue="value"></p-selectButton>
            </div>
            <div class="component-row mj-grid mj-gap-3">
                <p-selectButton [options]="sizeOptions" [(ngModel)]="selectedSizes" [multiple]="true" optionLabel="label" optionValue="value"></p-selectButton>
            </div>
            <span class="token-hint">Active: --mj-brand-primary | Inactive: --mj-bg-surface</span>
        </section>

        <!-- ToggleButton Section -->
        <section class="token-section">
            <h2>ToggleButton</h2>
            <p class="section-desc">A binary toggle button with on/off states and customizable labels and icons.</p>
            <div class="component-row mj-grid mj-gap-3">
                <p-toggleButton
                    [(ngModel)]="toggleValue1"
                    onLabel="Enabled"
                    offLabel="Disabled"
                    onIcon="pi pi-check"
                    offIcon="pi pi-times">
                </p-toggleButton>
                <p-toggleButton
                    [(ngModel)]="toggleValue2"
                    onLabel="Locked"
                    offLabel="Unlocked"
                    onIcon="pi pi-lock"
                    offIcon="pi pi-lock-open">
                </p-toggleButton>
            </div>
        </section>

        <!-- Rating Section -->
        <section class="token-section">
            <h2>Rating</h2>
            <p class="section-desc">Star-based rating input for capturing user feedback or displaying scores.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Interactive Rating</label>
                    <p-rating [(ngModel)]="ratingValue"></p-rating>
                    <span class="token-hint">Selected: {{ ratingValue }} / 5</span>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Read-Only</label>
                    <p-rating [(ngModel)]="ratingReadOnly" [readonly]="true"></p-rating>
                </div>
            </div>
        </section>

        <!-- Slider Section -->
        <section class="token-section">
            <h2>Slider</h2>
            <p class="section-desc">Range slider input for selecting numeric values or ranges.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Basic Slider: {{ sliderValue }}</label>
                    <p-slider [(ngModel)]="sliderValue" [min]="0" [max]="100"></p-slider>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Range Slider: {{ sliderRange[0] }} - {{ sliderRange[1] }}</label>
                    <p-slider [(ngModel)]="sliderRange" [range]="true" [min]="0" [max]="100"></p-slider>
                </div>
            </div>
        </section>

        <!-- Knob Section -->
        <section class="token-section">
            <h2>Knob</h2>
            <p class="section-desc">A circular dial input for selecting numeric values with a visual arc indicator.</p>
            <div class="component-row mj-grid mj-gap-3">
                <p-knob [(ngModel)]="knobValue" [min]="0" [max]="100" valueTemplate="{value}%"></p-knob>
                <p-knob [(ngModel)]="knobValueAlt" [min]="0" [max]="360" [step]="10" valueTemplate="{value}" [strokeWidth]="5" [size]="100"></p-knob>
                <p-knob [(ngModel)]="knobReadOnly" [readonly]="true" valueTemplate="{value}" [size]="80"></p-knob>
            </div>
            <span class="token-hint">Range color: --mj-brand-primary</span>
        </section>

        <!-- ColorPicker Section -->
        <section class="token-section">
            <h2>ColorPicker</h2>
            <p class="section-desc">Color selection input with a preview swatch and full color spectrum panel.</p>
            <div class="component-row mj-grid mj-gap-3">
                <div class="color-group mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                    <label>Inline Swatch</label>
                    <p-colorPicker [(ngModel)]="colorValue"></p-colorPicker>
                    <span class="token-hint">{{ colorValue }}</span>
                </div>
            </div>
        </section>

        <!-- Calendar Section -->
        <section class="token-section">
            <h2>Calendar</h2>
            <p class="section-desc">Date and time picker with inline and popup modes, range selection, and various display formats.</p>
            <div class="input-grid mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Basic Date</label>
                    <p-datepicker [(ngModel)]="calendarDate" [style]="{'width': '100%'}" placeholder="Select a date"></p-datepicker>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Date &amp; Time</label>
                    <p-datepicker [(ngModel)]="calendarDateTime" [showTime]="true" [hourFormat]="'12'" [style]="{'width': '100%'}" placeholder="Date and time"></p-datepicker>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Date Range</label>
                    <p-datepicker [(ngModel)]="calendarRange" selectionMode="range" [style]="{'width': '100%'}" placeholder="Select range"></p-datepicker>
                </div>
                <div class="input-group mj-grid mj-flex-column mj-gap-2">
                    <label>Month Picker</label>
                    <p-datepicker [(ngModel)]="calendarMonth" view="month" dateFormat="mm/yy" [style]="{'width': '100%'}" placeholder="Select month"></p-datepicker>
                </div>
            </div>
        </section>

        <!-- Editor Section -->
        <section class="token-section">
            <h2>Editor</h2>
            <p class="section-desc">Rich text editor (Quill-based) for formatted content input with a customizable toolbar.</p>
            <div class="editor-container">
                <p-editor [(ngModel)]="editorText" [style]="{'height': '200px'}"></p-editor>
            </div>
            <span class="token-hint">Toolbar bg: --mj-bg-surface-sunken | Content area: --mj-bg-surface</span>
        </section>
    </div>
  `,
    styles: [`
    .form-selects-page {
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

    .component-row {
        margin-bottom: var(--mj-space-4);
    }

    .input-group {
        label {
            font-size: var(--mj-text-sm);
            font-weight: var(--mj-font-medium);
            color: var(--mj-text-primary);
        }
    }

    .token-hint {
        font-family: var(--mj-font-family-mono);
        font-size: 10px;
        color: var(--mj-text-muted);
    }

    .selection-row {
        padding: var(--mj-space-1) 0;

        label {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-primary);
            cursor: pointer;
        }
    }

    .color-group {
        label {
            font-size: var(--mj-text-sm);
            font-weight: var(--mj-font-medium);
            color: var(--mj-text-primary);
        }
    }

    .editor-container {
        margin-bottom: var(--mj-space-3);
    }
  `]
})
export class FormSelectsComponent {
    // MultiSelect
    cities: SelectOption[] = [
        { label: 'New York', value: 'ny' },
        { label: 'San Francisco', value: 'sf' },
        { label: 'Los Angeles', value: 'la' },
        { label: 'Chicago', value: 'chi' },
        { label: 'Miami', value: 'mia' },
        { label: 'Seattle', value: 'sea' },
        { label: 'Austin', value: 'aus' },
        { label: 'Denver', value: 'den' }
    ];
    selectedCities: string[] = ['ny', 'sf'];
    selectedCitiesChip: string[] = ['la', 'chi', 'mia', 'sea'];

    // Listbox
    selectedListboxCity: string | null = null;
    selectedListboxCities: string[] = [];

    // CascadeSelect
    cascadeCountries: CascadeOption[] = [
        {
            name: 'United States',
            code: 'US',
            states: [
                {
                    name: 'California',
                    code: 'CA',
                    cities: [
                        { name: 'Los Angeles', code: 'LA' },
                        { name: 'San Diego', code: 'SD' },
                        { name: 'San Francisco', code: 'SF' }
                    ]
                },
                {
                    name: 'Texas',
                    code: 'TX',
                    cities: [
                        { name: 'Austin', code: 'AU' },
                        { name: 'Dallas', code: 'DA' },
                        { name: 'Houston', code: 'HO' }
                    ]
                }
            ]
        },
        {
            name: 'Canada',
            code: 'CA',
            states: [
                {
                    name: 'Ontario',
                    code: 'ON',
                    cities: [
                        { name: 'Toronto', code: 'TO' },
                        { name: 'Ottawa', code: 'OT' }
                    ]
                },
                {
                    name: 'British Columbia',
                    code: 'BC',
                    cities: [
                        { name: 'Vancouver', code: 'VA' },
                        { name: 'Victoria', code: 'VI' }
                    ]
                }
            ]
        }
    ];
    selectedCascade: CascadeOption | null = null;

    // TreeSelect
    treeNodes: TreeNode[] = [
        {
            label: 'Documents',
            data: 'documents',
            expandedIcon: 'pi pi-folder-open',
            collapsedIcon: 'pi pi-folder',
            children: [
                {
                    label: 'Work',
                    data: 'work',
                    expandedIcon: 'pi pi-folder-open',
                    collapsedIcon: 'pi pi-folder',
                    children: [
                        { label: 'Proposals.docx', data: 'proposals', icon: 'pi pi-file' },
                        { label: 'Reports.xlsx', data: 'reports', icon: 'pi pi-file' }
                    ]
                },
                {
                    label: 'Personal',
                    data: 'personal',
                    expandedIcon: 'pi pi-folder-open',
                    collapsedIcon: 'pi pi-folder',
                    children: [
                        { label: 'Resume.pdf', data: 'resume', icon: 'pi pi-file' },
                        { label: 'Notes.txt', data: 'notes', icon: 'pi pi-file' }
                    ]
                }
            ]
        },
        {
            label: 'Photos',
            data: 'photos',
            expandedIcon: 'pi pi-folder-open',
            collapsedIcon: 'pi pi-folder',
            children: [
                { label: 'Vacation.jpg', data: 'vacation', icon: 'pi pi-image' },
                { label: 'Profile.png', data: 'profile', icon: 'pi pi-image' }
            ]
        },
        {
            label: 'Settings',
            data: 'settings',
            icon: 'pi pi-cog'
        }
    ];
    selectedTreeNode: TreeNode | null = null;
    selectedTreeNodes: TreeNode[] = [];

    // SelectButton
    viewOptions: SelectOption[] = [
        { label: 'List', value: 'list' },
        { label: 'Grid', value: 'grid' },
        { label: 'Table', value: 'table' }
    ];
    selectedView: string = 'list';

    sizeOptions: SelectOption[] = [
        { label: 'S', value: 'small' },
        { label: 'M', value: 'medium' },
        { label: 'L', value: 'large' },
        { label: 'XL', value: 'xlarge' }
    ];
    selectedSizes: string[] = ['medium'];

    // ToggleButton
    toggleValue1 = true;
    toggleValue2 = false;

    // Rating
    ratingValue: number = 3;
    ratingReadOnly: number = 4;

    // Slider
    sliderValue: number = 40;
    sliderRange: number[] = [20, 80];

    // Knob
    knobValue: number = 65;
    knobValueAlt: number = 120;
    knobReadOnly: number = 42;

    // ColorPicker
    colorValue: string = '6366f1';

    // Calendar
    calendarDate: Date | null = null;
    calendarDateTime: Date | null = null;
    calendarRange: Date[] | null = null;
    calendarMonth: Date | null = null;

    // Editor
    editorText: string = '<p>This is a <strong>rich text editor</strong> powered by <em>Quill</em>. It supports formatting, lists, and more.</p>';
}
