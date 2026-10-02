import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { NewComponentResult } from '../../component-studio-dashboard.component';

interface TypeOption {
  value: string;
  label: string;
  icon: string;
  description: string;
}

@Component({
  standalone: false,
  selector: 'mj-new-component-dialog',
  templateUrl: './new-component-dialog.component.html',
  styleUrls: ['./new-component-dialog.component.css']
})
export class NewComponentDialogComponent {

  @Input() Visible: boolean = false;
  @Output() Close = new EventEmitter<NewComponentResult | null>();

  public Form: FormGroup;

  /** @deprecated Use {@link Form}. */
  public get form(): FormGroup {
    return this.Form;
  }
  /** @deprecated Use {@link Form}. */
  public set form(value: FormGroup) {
    this.Form = value;
  }
  public SelectedType: string = 'dashboard';

  public TypeOptions: TypeOption[] = [
    { value: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-gauge-high', description: 'Interactive data dashboard' },
    { value: 'report', label: 'Report', icon: 'fa-solid fa-file-lines', description: 'Formatted data report' },
    { value: 'chart', label: 'Chart', icon: 'fa-solid fa-chart-bar', description: 'Data visualization chart' },
    { value: 'form', label: 'Form', icon: 'fa-solid fa-rectangle-list', description: 'Interactive input form' },
    { value: 'component', label: 'Component', icon: 'fa-solid fa-puzzle-piece', description: 'Reusable UI component' }
  ];

  private lastAutoFilledTitle: string = '';

  constructor(private fb: FormBuilder) {
    this.Form = this.fb.group({
      name: ['', Validators.required],
      title: [''],
      description: ['']
    });
  }

  OnNameChange(): void {
    const nameValue = this.Form.get('name')?.value || '';
    const titleControl = this.Form.get('title');
    if (!titleControl) return;

    const currentTitle = titleControl.value || '';
    if (currentTitle === '' || currentTitle === this.lastAutoFilledTitle) {
      titleControl.setValue(nameValue);
      this.lastAutoFilledTitle = nameValue;
    }
  }

  OnSelectType(type: string): void {
    this.SelectedType = type;
  }

  OnCreate(): void {
    if (!this.Form.valid) return;

    const result: NewComponentResult = {
      name: this.Form.get('name')?.value?.trim() || '',
      title: this.Form.get('title')?.value?.trim() || this.Form.get('name')?.value?.trim() || '',
      description: this.Form.get('description')?.value?.trim() || '',
      type: this.SelectedType
    };

    this.resetForm();
    this.Close.emit(result);
  }

  OnCancel(): void {
    this.resetForm();
    this.Close.emit(null);
  }

  private resetForm(): void {
    this.Form.reset();
    this.SelectedType = 'dashboard';
    this.lastAutoFilledTitle = '';
  }
}
