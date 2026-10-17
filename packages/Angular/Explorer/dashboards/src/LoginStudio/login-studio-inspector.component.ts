import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MJAlertComponent, MJButtonDirective, MJDropdownComponent, MJNumericInputComponent, MJSwitchComponent, MJViewToggleComponent,
  type ViewToggleOption,
} from '@memberjunction/ng-ui-components';
import type { MJLoginRegionCommand } from '@memberjunction/ng-auth-services';
import {
  LOGIN_CARD_ICONS, LOGIN_COLOR_LABEL, LOGIN_LAYOUTS, LOGIN_LIMITS, LOGIN_LOGO_SOURCE_LABEL, LOGIN_LOGO_SOURCES,
  LoginBlockProblems, LoginContrastWarnings, StartingLoginColor,
  type LoginBlock, type LoginCardBlock, type LoginColorKey, type LoginDesign, type LoginHeadlineBlock, type LoginImageBlock,
  type LoginLayout, type LoginLinksBlock, type LoginLogoBlock, type LoginRegion, type LoginSize, type LoginTextBlock,
} from '@memberjunction/theme-engine';

/** A block field the inspector can change. */
export type LoginBlockField = 'Source' | 'Size' | 'Width' | 'Text' | 'Muted' | 'Icon' | 'Title' | 'Href' | 'NewTab' | 'URL' | 'Alt' | 'HideWhenStacked';
/** A page-level field the inspector can change. */
export type LoginPageField = 'Layout' | 'Alignment' | 'PanelWidth' | 'Tone' | 'CardRadius' | 'BannerShare';
export type LoginBackgroundField = 'Kind' | 'Color' | 'Color2' | 'ImageURL' | 'Overlay';

/** One change the inspector asks for. The studio applies it, so every change is one undoable step. */
export type LoginEdit =
  | { Kind: 'Block'; Field: LoginBlockField; Value: string | boolean | null }
  | { Kind: 'Link'; Index: number; Field: 'Label' | 'Href'; Value: string }
  | { Kind: 'AddLink' }
  | { Kind: 'RemoveLink'; Index: number }
  | { Kind: 'Page'; Field: LoginPageField; Value: string }
  | { Kind: 'Heading'; Value: string }
  | { Kind: 'Background'; Field: LoginBackgroundField; Value: string | number | null }
  | { Kind: 'Color'; Key: LoginColorKey; Value: string | null };

/** The two parts of the page that are not blocks: each opens its own settings when clicked. */
export type LoginSurface = 'Banner' | 'Panel';

interface Option { Label: string; Value: string }
interface ColorRow { Key: LoginColorKey; Name: string }

const toggle = (labels: Record<string, string>): ViewToggleOption[] => Object.entries(labels).map(([key, label]) => ({ key, label }));

/**
 * Login Studio's settings column: the selected block's fields, the selected surface's, or the page's.
 * A color appears with the thing it paints. Owns no state: every change goes out as a {@link LoginEdit}
 * the studio applies, so undo, the preview and the unsaved state live in one place.
 */
@Component({
  standalone: true,
  selector: 'mj-login-studio-inspector',
  imports: [
    FormsModule, NgTemplateOutlet, MJAlertComponent, MJButtonDirective, MJDropdownComponent, MJNumericInputComponent, MJSwitchComponent,
    MJViewToggleComponent,
  ],
  templateUrl: './login-studio-inspector.component.html',
  styleUrls: ['./login-studio-inspector.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginStudioInspectorComponent {
  @Input() Design!: LoginDesign;
  @Input() Selected: LoginBlock | null = null;
  /** The region the selected block sits in: a card's colors depend on which side of the page it is on. */
  @Input() SelectedRegion: LoginRegion | null = null;
  /** The selected surface, when no block is selected. */
  @Input() Surface: LoginSurface | null = null;
  /** A published page or a draft exists, so "Use the stock sign-in page" applies. */
  @Input() CanReset = false;
  @Input() Saving = false;

  @Output() EditRequested = new EventEmitter<LoginEdit>();
  @Output() CommandRequested = new EventEmitter<MJLoginRegionCommand>();
  @Output() StockPageRequested = new EventEmitter<void>();
  @Output() SurfaceSelectRequested = new EventEmitter<LoginSurface>();

  public readonly Limits = LOGIN_LIMITS;
  public readonly Layouts = LOGIN_LAYOUTS;
  public readonly LayoutLabel: Record<LoginLayout, string> = { split: 'Split', 'split-reverse': 'Reversed', centered: 'Centered' };
  public readonly SizeOptions = toggle({ sm: 'Small', md: 'Medium', lg: 'Large' });
  public readonly WidthOptions = toggle({ full: 'Full', half: 'Half', third: 'Third' });
  public readonly RadiusOptions = toggle({ none: 'Square', sm: 'S', md: 'M', lg: 'L', xl: 'XL' });
  public readonly BackgroundOptions = toggle({ brand: 'Brand', color: 'Color', gradient: 'Gradient', image: 'Image' });
  public readonly ToneOptions = toggle({ light: 'Light text', dark: 'Dark text' });
  public readonly AlignmentOptions = toggle({ start: 'Left', center: 'Centered' });
  public readonly BannerShareOptions = toggle({ narrow: 'Narrow', balanced: 'Balanced', wide: 'Wide' });
  public readonly PanelWidthOptions = toggle({ compact: 'Compact', wide: 'Wide' });
  public readonly ColorLabel = LOGIN_COLOR_LABEL;
  public readonly LogoSourceOptions: Option[] = LOGIN_LOGO_SOURCES.map((s) => ({ Value: s, Label: LOGIN_LOGO_SOURCE_LABEL[s] }));
  public readonly IconOptions: Option[] = [
    { Value: '', Label: 'No icon' }, ...Object.entries(LOGIN_CARD_ICONS).map(([Value, Label]) => ({ Value, Label })),
  ];

  public get SelectedProblems(): string[] {
    return this.Selected ? LoginBlockProblems(this.Selected) : [];
  }

  /** Only the warnings about the colors on screen. */
  public get ContrastWarnings(): string[] {
    const keys = this.Colors.map((c) => c.Key);
    return keys.length ? LoginContrastWarnings(this.Design, keys) : [];
  }

  /** The colors of what is selected. Each is one --mj-login-* token, so it is shared across that side of the page. */
  public get Colors(): ColorRow[] {
    if (this.Surface === 'Banner') return [{ Key: 'BannerText', Name: 'Text' }];
    if (this.Surface === 'Panel') return [{ Key: 'PanelBg', Name: 'Background' }, { Key: 'PanelText', Name: 'Text' }];
    const b = this.Selected;
    if (!b || !this.SelectedRegion) return [];
    const onBanner = this.SelectedRegion === 'Banner';
    if (b.Type === 'card') {
      return onBanner
        ? [{ Key: 'BannerCardBg', Name: 'Card background' }, { Key: 'BannerCardText', Name: 'Card text' }]
        : [{ Key: 'CardBg', Name: 'Card background' }, { Key: 'CardText', Name: 'Card text' }, { Key: 'CardBorder', Name: 'Card border' }];
    }
    if (b.Type === 'headline' || b.Type === 'text' || b.Type === 'links') {
      return [{ Key: onBanner ? 'BannerText' : 'PanelText', Name: 'Text' }];
    }
    return [];
  }

  /** Says who else a color change reaches, so one card's color repainting the others is no surprise. */
  public get ColorScope(): string | null {
    const b = this.Selected;
    if (this.Surface || !b || !this.Colors.length) return null;
    const where = this.SelectedRegion === 'Banner' ? 'the story panel' : 'the sign-in column';
    return b.Type === 'card' ? `Shared by every card in ${where}.` : `Shared by all the text in ${where}.`;
  }

  // The selected block, typed by kind: what each section of the template binds to.
  public get AsLogo(): LoginLogoBlock | null { return this.Selected?.Type === 'logo' ? this.Selected : null; }
  public get AsHeadline(): LoginHeadlineBlock | null { return this.Selected?.Type === 'headline' ? this.Selected : null; }
  public get AsText(): LoginTextBlock | null { return this.Selected?.Type === 'text' ? this.Selected : null; }
  public get AsCard(): LoginCardBlock | null { return this.Selected?.Type === 'card' ? this.Selected : null; }
  public get AsLinks(): LoginLinksBlock | null { return this.Selected?.Type === 'links' ? this.Selected : null; }
  public get AsImage(): LoginImageBlock | null { return this.Selected?.Type === 'image' ? this.Selected : null; }

  /** The selected block's size, when its kind comes in sizes (logo, headline, image, spacer). */
  public get SelectedSize(): LoginSize | null {
    const b = this.Selected;
    return b && 'Size' in b ? b.Size : null;
  }

  public SetBlock(field: LoginBlockField, value: string | boolean | null): void {
    this.EditRequested.emit({ Kind: 'Block', Field: field, Value: value });
  }

  /** Text that may be cleared: an empty field is stored as null, not ''. */
  public SetBlockOptional(field: LoginBlockField, value: string): void {
    this.SetBlock(field, value.trim() ? value : null);
  }

  public SetLink(index: number, field: 'Label' | 'Href', value: string): void {
    this.EditRequested.emit({ Kind: 'Link', Index: index, Field: field, Value: value });
  }

  public AddLink(): void {
    this.EditRequested.emit({ Kind: 'AddLink' });
  }

  public RemoveLink(index: number): void {
    this.EditRequested.emit({ Kind: 'RemoveLink', Index: index });
  }

  public SetPage(field: LoginPageField, value: string): void {
    this.EditRequested.emit({ Kind: 'Page', Field: field, Value: value });
  }

  public SetHeading(value: string): void {
    this.EditRequested.emit({ Kind: 'Heading', Value: value });
  }

  public SetBackground(field: LoginBackgroundField, value: string | number | null): void {
    this.EditRequested.emit({ Kind: 'Background', Field: field, Value: value });
  }

  public SetColor(key: LoginColorKey, value: string | null): void {
    this.EditRequested.emit({ Kind: 'Color', Key: key, Value: value });
  }

  public StartColor(key: LoginColorKey): void {
    this.SetColor(key, StartingLoginColor(this.Design, key));
  }

  public Run(kind: MJLoginRegionCommand['Kind']): void {
    if (this.Selected) this.CommandRequested.emit({ Kind: kind, ID: this.Selected.ID });
  }

  /** A text input's value, typed, so the template never needs a cast to read it. */
  public ValueOf(e: Event): string {
    return (e.target as HTMLInputElement | null)?.value ?? '';
  }
}
