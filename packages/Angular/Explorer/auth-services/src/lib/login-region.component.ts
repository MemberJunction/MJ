import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import {
  IsSafeLoginHref, IsSafeLoginImageURL, LOGIN_BLOCK_META, LoginLogoURL,
  type LoginBlock, type LoginBlockType, type LoginRegion, type ThemeLogos,
} from '@memberjunction/theme-engine';

/** What the editor asks of a block from its toolbar or the keyboard. */
export interface MJLoginRegionCommand { Kind: 'up' | 'down' | 'duplicate' | 'delete'; ID: string }

/** A drop on a region: a block moved (Item is the block) or a palette tile dropped (Item is its type). */
export interface MJLoginRegionDrop {
  /** The list it came from: a region, or the editor's palette. */
  From: string;
  To: LoginRegion;
  PreviousIndex: number;
  CurrentIndex: number;
  Item: LoginBlock | LoginBlockType;
}

/**
 * One region of a designed sign-in page, drawn the same way on the live login screen and in Login
 * Studio's preview (`Editable`, where it becomes a drop list of selectable blocks). One renderer keeps
 * the preview honest. Colors are inherited from the pane through the `--mj-login-*` tokens.
 *
 * @since 6.2.0
 */
@Component({
  selector: 'mj-login-region',
  standalone: true,
  imports: [NgTemplateOutlet, CdkDropList, CdkDrag, CdkDragPlaceholder, MJButtonDirective],
  templateUrl: './login-region.component.html',
  styleUrls: ['./login-region.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MJLoginRegionComponent {
  @Input() Blocks: readonly LoginBlock[] = [];
  @Input() Region: LoginRegion = 'Banner';
  /** The theme's logo variants, which logo blocks draw. */
  @Input() Logos: ThemeLogos = {};
  /** The brand's name: the logo's accessible name. */
  @Input() BrandName: string | null = null;
  /**
   * The editor's phone preview: draw as the login screen does at 900px and below. (The live page needs
   * no input for this; its CSS follows the viewport.)
   */
  @Input() Stacked = false;
  /** Center the blocks (the design's alignment; the sign-in column is always centered). */
  @Input() Center = false;
  /** Editor mode: drop list, selection and toolbar. Off on the live page. */
  @Input() Editable = false;
  @Input() SelectedID: string | null = null;

  @Output() Dropped = new EventEmitter<MJLoginRegionDrop>();
  @Output() SelectRequested = new EventEmitter<string>();
  @Output() CommandRequested = new EventEmitter<MJLoginRegionCommand>();

  public get IsBanner(): boolean {
    return this.Region === 'Banner';
  }

  /** A narrower block's share of its row; none in the phone preview, where each block takes a row. */
  public WidthClass(b: LoginBlock): string {
    return !this.Stacked && b.Width !== 'full' ? `lr__width--${b.Width}` : '';
  }

  public OnDropped(e: CdkDragDrop<LoginRegion, string, LoginBlock | LoginBlockType>): void {
    this.Dropped.emit({
      From: e.previousContainer.data, To: e.container.data, PreviousIndex: e.previousIndex, CurrentIndex: e.currentIndex, Item: e.item.data,
    });
  }

  public LogoURL(b: LoginBlock): string | null {
    return b.Type === 'logo' ? LoginLogoURL(b.Source, this.Logos) : null;
  }

  public SafeHref(href: string | null | undefined): string | null {
    return IsSafeLoginHref(href) ? href : null;
  }

  public SafeImage(url: string | null | undefined): string | null {
    return IsSafeLoginImageURL(url) ? url : null;
  }

  public Label(b: LoginBlock): string {
    return LOGIN_BLOCK_META[b.Type].Label;
  }

  public Emit(kind: MJLoginRegionCommand['Kind'], id: string, e: Event): void {
    e.stopPropagation();
    this.CommandRequested.emit({ Kind: kind, ID: id });
  }

  public Select(id: string, e: Event): void {
    e.stopPropagation();
    this.SelectRequested.emit(id);
  }

  public OnKey(id: string, e: KeyboardEvent): void {
    // Only keys pressed ON the block: Enter on its toolbar buttons must stay a click.
    if (e.target !== e.currentTarget) return;
    // The keyboard's way to do what dragging does: Alt+Arrow moves the focused block.
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      this.CommandRequested.emit({ Kind: e.key === 'ArrowUp' ? 'up' : 'down', ID: id });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.CommandRequested.emit({ Kind: 'delete', ID: id });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.SelectRequested.emit(id);
    }
  }
}
