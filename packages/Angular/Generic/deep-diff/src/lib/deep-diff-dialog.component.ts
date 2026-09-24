import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Dialog wrapper component for the deep diff viewer
 */
@Component({
  standalone: false,
  selector: 'mj-deep-diff-dialog',
  templateUrl: './deep-diff-dialog.component.html',
  styleUrls: ['./deep-diff-dialog.component.css']
})
export class DeepDiffDialogComponent {
  @Input() OldValue: any;

  /** @deprecated Use {@link OldValue}. */
  @Input() set oldValue(value: any) {
    this.OldValue = value;
  }
  /** @deprecated Use {@link OldValue}. */
  get oldValue(): any {
    return this.OldValue;
  }
  @Input() NewValue: any;

  /** @deprecated Use {@link NewValue}. */
  @Input() set newValue(value: any) {
    this.NewValue = value;
  }
  /** @deprecated Use {@link NewValue}. */
  get newValue(): any {
    return this.NewValue;
  }
  @Input() Title: string = 'Deep Diff Analysis';

  /** @deprecated Use {@link Title}. */
  @Input() set title(value: string) {
    this.Title = value;
  }
  /** @deprecated Use {@link Title}. */
  get title(): string {
    return this.Title;
  }
  @Input() ShowSummary: boolean = true;

  /** @deprecated Use {@link ShowSummary}. */
  @Input() set showSummary(value: boolean) {
    this.ShowSummary = value;
  }
  /** @deprecated Use {@link ShowSummary}. */
  get showSummary(): boolean {
    return this.ShowSummary;
  }
  @Input() ShowUnchanged: boolean = false;

  /** @deprecated Use {@link ShowUnchanged}. */
  @Input() set showUnchanged(value: boolean) {
    this.ShowUnchanged = value;
  }
  /** @deprecated Use {@link ShowUnchanged}. */
  get showUnchanged(): boolean {
    return this.ShowUnchanged;
  }
  @Input() ExpandAll: boolean = false;

  /** @deprecated Use {@link ExpandAll}. */
  @Input() set expandAll(value: boolean) {
    this.ExpandAll = value;
  }
  /** @deprecated Use {@link ExpandAll}. */
  get expandAll(): boolean {
    return this.ExpandAll;
  }
  @Input() MaxDepth: number = 10;

  /** @deprecated Use {@link MaxDepth}. */
  @Input() set maxDepth(value: number) {
    this.MaxDepth = value;
  }
  /** @deprecated Use {@link MaxDepth}. */
  get maxDepth(): number {
    return this.MaxDepth;
  }
  @Input() MaxStringLength: number = 100;

  /** @deprecated Use {@link MaxStringLength}. */
  @Input() set maxStringLength(value: number) {
    this.MaxStringLength = value;
  }
  /** @deprecated Use {@link MaxStringLength}. */
  get maxStringLength(): number {
    return this.MaxStringLength;
  }
  @Input() TreatNullAsUndefined: boolean = false;

  /** @deprecated Use {@link TreatNullAsUndefined}. */
  @Input() set treatNullAsUndefined(value: boolean) {
    this.TreatNullAsUndefined = value;
  }
  /** @deprecated Use {@link TreatNullAsUndefined}. */
  get treatNullAsUndefined(): boolean {
    return this.TreatNullAsUndefined;
  }
  @Input() Visible: boolean = false;

  /** @deprecated Use {@link Visible}. */
  @Input() set visible(value: boolean) {
    this.Visible = value;
  }
  /** @deprecated Use {@link Visible}. */
  get visible(): boolean {
    return this.Visible;
  }
  @Input() Width: string = '80%';

  /** @deprecated Use {@link Width}. */
  @Input() set width(value: string) {
    this.Width = value;
  }
  /** @deprecated Use {@link Width}. */
  get width(): string {
    return this.Width;
  }
  @Input() Height: string = '80vh';

  /** @deprecated Use {@link Height}. */
  @Input() set height(value: string) {
    this.Height = value;
  }
  /** @deprecated Use {@link Height}. */
  get height(): string {
    return this.Height;
  }
  
  @Output() VisibleChange = new EventEmitter<boolean>();

  /**
   * @deprecated Use {@link VisibleChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (visibleChange) keeps working. Must stay AFTER VisibleChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() visibleChange = this.VisibleChange;
  @Output() Close = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Close}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (close) keeps working. Must stay AFTER Close: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() close = this.Close;
  
  public IsMaximized: boolean = false;

  /** @deprecated Use {@link IsMaximized}. */
  public get isMaximized(): boolean {
    return this.IsMaximized;
  }
  /** @deprecated Use {@link IsMaximized}. */
  public set isMaximized(value: boolean) {
    this.IsMaximized = value;
  }

  public get DialogWidth(): string {
    return this.IsMaximized ? '95vw' : this.Width;
  }

  /** @deprecated Use {@link DialogWidth}. */
  public get dialogWidth(): string {
    return this.DialogWidth;
  }

  public get DialogHeight(): string {
    return this.IsMaximized ? '95vh' : this.Height;
  }

  /** @deprecated Use {@link DialogHeight}. */
  public get dialogHeight(): string {
    return this.DialogHeight;
  }

  CloseDialog(): void {
    this.Visible = false;
    this.VisibleChange.emit(false);
    this.Close.emit();
  }

  /** @deprecated Use {@link CloseDialog}. */
  closeDialog(): void {
    return this.CloseDialog();
  }

  ToggleMaximize(): void {
    this.IsMaximized = !this.IsMaximized;
  }

  /** @deprecated Use {@link ToggleMaximize}. */
  toggleMaximize(): void {
    return this.ToggleMaximize();
  }
}