import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import type { ForkSummary } from '@memberjunction/core-entities';
import { BuildForkListRows, type ForkListFilter, type ForkListRow } from '../../utils/conversation-forks';

/**
 * The forks of a conversation, as a popover list with All / Mine filters. A row opens its fork.
 * Takes focus when it opens; Escape closes it.
 */
@Component({
  standalone: false,
  selector: 'mj-conversation-forks-popover',
  templateUrl: './forks-popover.component.html',
  styleUrls: ['./forks-popover.component.css'],
})
export class ForksPopoverComponent implements AfterViewInit {
  private _summaries: ReadonlyArray<ForkSummary> = [];
  private _currentUserId = '';

  @ViewChild('panel') private panel?: ElementRef<HTMLElement>;

  /** The fork summaries of the conversation. */
  @Input()
  public set Summaries(value: ReadonlyArray<ForkSummary>) {
    this._summaries = value ?? [];
    this.rebuild();
  }
  public get Summaries(): ReadonlyArray<ForkSummary> {
    return this._summaries;
  }

  /** The person looking, for the Mine filter. */
  @Input()
  public set CurrentUserID(value: string) {
    this._currentUserId = value ?? '';
    this.rebuild();
  }
  public get CurrentUserID(): string {
    return this._currentUserId;
  }

  /** The id of the popover element, for the opener's aria-controls. */
  @Input() public PanelID = '';

  /** A row was chosen: the id of its fork. */
  @Output() public ForkSelected = new EventEmitter<string>();
  /** The close button or Escape was pressed. */
  @Output() public Closed = new EventEmitter<void>();

  public Filter: ForkListFilter = 'All';
  public Rows: ForkListRow[] = [];

  public ngAfterViewInit(): void {
    this.panel?.nativeElement.focus({ preventScroll: true });
  }

  public SetFilter(filter: ForkListFilter): void {
    this.Filter = filter;
    this.rebuild();
  }

  public SelectRow(row: ForkListRow): void {
    this.ForkSelected.emit(row.Summary.Branch.ID);
  }

  public Close(): void {
    this.Closed.emit();
  }

  /** Escape inside the popover closes it; the key goes no further up the page. */
  @HostListener('keydown.escape', ['$event'])
  public OnEscape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.Close();
  }

  private rebuild(): void {
    this.Rows = BuildForkListRows(this._summaries, this.Filter ?? 'All', this._currentUserId, new Date());
  }
}
