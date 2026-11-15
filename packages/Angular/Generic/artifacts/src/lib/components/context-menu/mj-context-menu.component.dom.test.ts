import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
import type { ContextMenuCommandBase, ContextMenuItem } from './context-menu.types';
import { MjContextMenuComponent } from './mj-context-menu.component';

interface DemoCommand extends ContextMenuCommandBase {
  readonly Type:
    | 'cut'
    | 'copy'
    | 'duplicate'
    | 'bold'
    | 'italic'
    | 'align-left'
    | 'align-center'
    | 'show-gridlines'
    | 'fill-red'
    | 'fill-blue'
    | 'deep-leaf'
    | 'delete';
}

const BASE_ITEMS: ContextMenuItem<DemoCommand>[] = [
  { Kind: 'header', ID: 'hdr-edit', Label: 'Edit' },
  {
    Kind: 'action',
    ID: 'cut',
    Label: 'Cut',
    Icon: 'fa-solid fa-scissors',
    Shortcut: '⌘X',
    Disabled: true,
    DisabledReason: 'Locked by owner',
    Command: { Type: 'cut' },
  },
  {
    Kind: 'action',
    ID: 'copy',
    Label: 'Copy',
    Icon: 'fa-regular fa-copy',
    Shortcut: '⌘C',
    BadgeText: '2 rows',
    Command: { Type: 'copy' },
  },
  { Kind: 'separator', ID: 'sep-1' },
  {
    Kind: 'action',
    ID: 'duplicate',
    Label: 'Duplicate',
    Shortcut: '⌘D',
    Command: { Type: 'duplicate' },
  },
  {
    Kind: 'submenu',
    ID: 'format',
    Label: 'Format Text',
    Children: [
      {
        Kind: 'action',
        ID: 'bold',
        Label: 'Bold',
        Role: 'menuitemcheckbox',
        Checked: true,
        Command: { Type: 'bold' },
      },
      {
        Kind: 'action',
        ID: 'italic',
        Label: 'Italic',
        Role: 'menuitemcheckbox',
        Checked: false,
        Command: { Type: 'italic' },
      },
      {
        Kind: 'submenu',
        ID: 'align',
        Label: 'Alignment',
        Children: [
          {
            Kind: 'action',
            ID: 'align-left',
            Label: 'Align Left',
            Role: 'menuitemradio',
            Checked: true,
            Command: { Type: 'align-left' },
          },
          {
            Kind: 'action',
            ID: 'align-center',
            Label: 'Align Center',
            Role: 'menuitemradio',
            Checked: false,
            Command: { Type: 'align-center' },
          },
        ],
      },
    ],
  },
  {
    Kind: 'action',
    ID: 'show-gridlines',
    Label: 'Show Gridlines',
    Role: 'menuitemcheckbox',
    Checked: true,
    Command: { Type: 'show-gridlines' },
  },
  {
    Kind: 'swatch-row',
    ID: 'fill-color',
    Label: 'Fill Color',
    Swatches: [
      {
        Label: 'Clear Fill',
        PreviewCssColor: 'transparent',
        IsClearSwatch: true,
        Selected: false,
        Command: { Type: 'fill-red' },
      },
      {
        Label: 'Brand Blue',
        PreviewCssColor: 'var(--mj-brand-primary)',
        Selected: true,
        Command: { Type: 'fill-blue' },
      },
    ],
  },
  { Kind: 'separator', ID: 'sep-2' },
  {
    Kind: 'action',
    ID: 'delete',
    Label: 'Delete',
    Destructive: true,
    Command: { Type: 'delete' },
  },
];

@Component({
  standalone: false,
  selector: 'mj-test-escape-host',
  template: `
    <button type="button" data-testid="trigger-el">Trigger</button>
    <div contenteditable="true" data-testid="prose-editor">Hello world</div>
    <mj-context-menu
      [IsOpen]="IsOpen"
      [AnchorX]="AnchorX"
      [AnchorY]="AnchorY"
      [Items]="Items"
      [AriaLabel]="'Document Actions'"
      [RestoreFocusElement]="RestoreEl"
      (ItemSelected)="OnSelect($event)"
      (Closed)="IsOpen = false">
    </mj-context-menu>
  `,
})
class TestEscapeHostComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  public IsOpen = false;
  public AnchorX = 120;
  public AnchorY = 140;
  public Items: ReadonlyArray<ContextMenuItem<DemoCommand>> = BASE_ITEMS;
  public RestoreEl: HTMLElement | null = null;
  public ParentEscapeCount = 0;
  public SelectedCommands: DemoCommand[] = [];

  @HostListener('document:keydown.escape')
  public OnDocumentEscape(): void {
    this.ParentEscapeCount++;
  }

  public OpenMenu(restoreEl: HTMLElement | null = null): void {
    this.RestoreEl = restoreEl;
    this.IsOpen = true;
    this.cdr.markForCheck();
  }

  public OnSelect(cmd: DemoCommand): void {
    this.SelectedCommands.push(cmd);
  }
}

describe('MjContextMenuComponent (DOM)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  function renderMenu(
    items: ReadonlyArray<ContextMenuItem<DemoCommand>> = BASE_ITEMS,
    isOpen = true,
  ): ComponentFixture<MjContextMenuComponent<DemoCommand>> {
    return renderComponentFixture(MjContextMenuComponent<DemoCommand>, {
      imports: [CommonModule],
      declarations: [MjContextMenuComponent],
      inputs: {
        IsOpen: isOpen,
        AnchorX: 100,
        AnchorY: 120,
        Items: items,
        AriaLabel: 'Test Context Menu',
      },
    });
  }

  function dispatchKey(key: string): KeyboardEvent {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    return ev;
  }

  it('renders role="menu", menuitem, menuitemcheckbox, menuitemradio, badges, and shortcuts', () => {
    const f = renderMenu();
    const root = query(f, '[data-testid="mj-context-menu-root"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('role')).toBe('menu');
    expect(root?.getAttribute('aria-label')).toBe('Test Context Menu');

    const copyBtn = query(f, '[data-testid="mj-context-menu-item-copy"]');
    expect(copyBtn?.getAttribute('role')).toBe('menuitem');
    expect(copyBtn?.textContent).toContain('2 rows');
    expect(copyBtn?.textContent).toContain('⌘C');

    const gridBtn = query(f, '[data-testid="mj-context-menu-item-show-gridlines"]');
    expect(gridBtn?.getAttribute('role')).toBe('menuitemcheckbox');
    expect(gridBtn?.getAttribute('aria-checked')).toBe('true');

    const swatch1 = query(f, '[data-testid="mj-context-menu-swatch-fill-color-1"]');
    expect(swatch1?.getAttribute('role')).toBe('menuitemradio');
    expect(swatch1?.getAttribute('aria-checked')).toBe('true');

    const swatchList = query(f, '.mj-context-menu-swatch-list');
    expect(swatchList?.getAttribute('role')).toBe('none');
  });

  it('ArrowDown / ArrowUp wraps across focusable items, skips separators/headers, and lands on aria-disabled items', () => {
    const f = renderMenu();

    // First ArrowDown lands on first focusable item ('cut', which is aria-disabled="true")
    dispatchKey('ArrowDown');
    const cutBtn = query(f, '[data-testid="mj-context-menu-item-cut"]') as HTMLElement;
    expect(document.activeElement).toBe(cutBtn);
    expect(cutBtn.getAttribute('aria-disabled')).toBe('true');
    expect(cutBtn.getAttribute('title')).toBe('Locked by owner');

    // ArrowUp wraps from first item ('cut') to last focusable item ('delete')
    dispatchKey('ArrowUp');
    const deleteBtn = query(f, '[data-testid="mj-context-menu-item-delete"]') as HTMLElement;
    expect(document.activeElement).toBe(deleteBtn);

    // ArrowDown wraps from last item ('delete') back to first ('cut')
    dispatchKey('ArrowDown');
    expect(document.activeElement).toBe(cutBtn);
  });

  it('does NOT emit ItemSelected or close menu when activating an aria-disabled item via Enter or click', () => {
    const f = renderMenu();
    const selectedSpy = vi.fn<(cmd: DemoCommand) => void>();
    const closedSpy = vi.fn();
    f.componentInstance.ItemSelected.subscribe(selectedSpy);
    f.componentInstance.Closed.subscribe(closedSpy);

    dispatchKey('ArrowDown'); // focus disabled 'cut'
    dispatchKey('Enter');
    expect(selectedSpy).not.toHaveBeenCalled();
    expect(closedSpy).not.toHaveBeenCalled();
    expect(query(f, '[data-testid="mj-context-menu-root"]')).not.toBeNull();

    (query(f, '[data-testid="mj-context-menu-item-cut"]') as HTMLButtonElement).click();
    expect(selectedSpy).not.toHaveBeenCalled();
    expect(closedSpy).not.toHaveBeenCalled();
    expect(query(f, '[data-testid="mj-context-menu-root"]')).not.toBeNull();
  });

  it('supports Home / End navigation and emits ItemSelected on enabled item Enter', () => {
    const f = renderMenu();
    const selectedSpy = vi.fn<(cmd: DemoCommand) => void>();
    f.componentInstance.ItemSelected.subscribe(selectedSpy);

    dispatchKey('End');
    expect(document.activeElement).toBe(query(f, '[data-testid="mj-context-menu-item-delete"]'));

    dispatchKey('Home');
    expect(document.activeElement).toBe(query(f, '[data-testid="mj-context-menu-item-cut"]'));

    dispatchKey('ArrowDown'); // copy
    dispatchKey('Enter');
    expect(selectedSpy).toHaveBeenCalledWith({ Type: 'copy' });
    expect(query(f, '[data-testid="mj-context-menu-root"]')).toBeNull();
  });

  it('opens submenu on ArrowRight, focuses first child, and ArrowLeft / first Escape closes ONLY the submenu', () => {
    const f = renderMenu();

    // Move to 'format' submenu (cut -> copy -> duplicate -> format)
    dispatchKey('ArrowDown');
    dispatchKey('ArrowDown');
    dispatchKey('ArrowDown');
    dispatchKey('ArrowDown');
    const formatTrigger = query(f, '[data-testid="mj-context-menu-item-format"]') as HTMLElement;
    expect(document.activeElement).toBe(formatTrigger);

    dispatchKey('ArrowRight');
    const formatSub = query(f, '[data-testid="mj-context-menu-submenu-format"]');
    expect(formatSub).not.toBeNull();
    const boldBtn = query(f, '[data-testid="mj-context-menu-item-bold"]') as HTMLElement;
    expect(document.activeElement).toBe(boldBtn);
    expect(formatTrigger.getAttribute('aria-expanded')).toBe('true');

    // Navigate into second-level submenu 'align'
    dispatchKey('ArrowDown'); // italic
    dispatchKey('ArrowDown'); // align
    dispatchKey('ArrowRight');
    expect(query(f, '[data-testid="mj-context-menu-submenu-align"]')).not.toBeNull();
    expect(document.activeElement).toBe(query(f, '[data-testid="mj-context-menu-item-align-left"]'));

    // First Escape closes only 'align' submenu and restores focus to 'align' trigger
    dispatchKey('Escape');
    expect(query(f, '[data-testid="mj-context-menu-submenu-align"]')).toBeNull();
    expect(query(f, '[data-testid="mj-context-menu-submenu-format"]')).not.toBeNull();
    expect(document.activeElement).toBe(query(f, '[data-testid="mj-context-menu-item-align"]'));

    // ArrowLeft closes 'format' submenu and restores focus to 'format' trigger
    dispatchKey('ArrowLeft');
    expect(query(f, '[data-testid="mj-context-menu-submenu-format"]')).toBeNull();
    expect(query(f, '[data-testid="mj-context-menu-root"]')).not.toBeNull();
    expect(document.activeElement).toBe(formatTrigger);
  });

  it('enforces Escape precedence: closes menu, restores focus, and blocks parent document:keydown.escape listener', () => {
    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [MjContextMenuComponent, TestEscapeHostComponent],
    });
    const f = TestBed.createComponent(TestEscapeHostComponent);
    f.detectChanges();

    const triggerEl = query(f, '[data-testid="trigger-el"]') as HTMLElement;
    const focusSpy = vi.spyOn(triggerEl, 'focus');

    f.componentInstance.OpenMenu(triggerEl);
    f.detectChanges();

    expect(query(f, '[data-testid="mj-context-menu-root"]')).not.toBeNull();

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escapeEvent);
    f.detectChanges();

    expect(query(f, '[data-testid="mj-context-menu-root"]')).toBeNull();
    expect(f.componentInstance.IsOpen).toBe(false);
    expect(f.componentInstance.ParentEscapeCount).toBe(0);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('supports printable character typeahead ("d", "u") to focus Duplicate', () => {
    const f = renderMenu();

    dispatchKey('d');
    expect(document.activeElement).toBe(query(f, '[data-testid="mj-context-menu-item-duplicate"]'));

    dispatchKey('u');
    expect(document.activeElement).toBe(query(f, '[data-testid="mj-context-menu-item-duplicate"]'));
  });

  it('prevents default on item mousedown so adjacent contenteditable selection stays intact', () => {
    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [MjContextMenuComponent, TestEscapeHostComponent],
    });
    const f = TestBed.createComponent(TestEscapeHostComponent);
    f.detectChanges();

    const editor = query(f, '[data-testid="prose-editor"]') as HTMLElement;
    const textNode = editor.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    f.componentInstance.OpenMenu();
    f.detectChanges();

    const copyBtn = query(f, '[data-testid="mj-context-menu-item-copy"]') as HTMLButtonElement;
    const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    copyBtn.dispatchEvent(mouseDownEvent);

    expect(mouseDownEvent.defaultPrevented).toBe(true);
    expect(window.getSelection()?.toString()).toBe('Hello');
  });

  it('navigates swatch-row items horizontally with ArrowRight/ArrowLeft and selects with Enter', () => {
    const f = renderMenu();
    const selectedSpy = vi.fn<(cmd: DemoCommand) => void>();
    f.componentInstance.ItemSelected.subscribe(selectedSpy);

    // Move to swatch-row ('fill-color') via typeahead 'f' -> format, then 'f' -> fill-color
    dispatchKey('f');
    expect(document.activeElement).toBe(query(f, '[data-testid="mj-context-menu-item-format"]'));
    dispatchKey('f');
    expect(document.activeElement).toBe(
      query(f, '[data-testid="mj-context-menu-swatch-fill-color-0"]'),
    );

    dispatchKey('ArrowRight');
    expect(document.activeElement).toBe(
      query(f, '[data-testid="mj-context-menu-swatch-fill-color-1"]'),
    );

    dispatchKey('Enter');
    expect(selectedSpy).toHaveBeenCalledWith({ Type: 'fill-blue' });
  });

  it('dismisses on outside pointerdown and external scroll, but stays open on internal menu scroll', () => {
    const f = renderMenu();
    const closedSpy = vi.fn();
    f.componentInstance.Closed.subscribe(closedSpy);

    const root = query(f, '[data-testid="mj-context-menu-root"]') as HTMLElement;
    root.dispatchEvent(new Event('scroll', { bubbles: false }));
    expect(closedSpy).not.toHaveBeenCalled();

    // Pointerdown inside menu does not dismiss
    const copyBtn = query(f, '[data-testid="mj-context-menu-item-copy"]') as HTMLElement;
    copyBtn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(closedSpy).not.toHaveBeenCalled();

    // External scroll dismisses
    document.dispatchEvent(new Event('scroll', { bubbles: true }));
    expect(closedSpy).toHaveBeenCalledTimes(1);
    expect(query(f, '[data-testid="mj-context-menu-root"]')).toBeNull();
  });

  it('dismisses on outside pointerdown on document body', () => {
    const f = renderMenu();
    const closedSpy = vi.fn();
    f.componentInstance.Closed.subscribe(closedSpy);

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(closedSpy).toHaveBeenCalledTimes(1);
    expect(query(f, '[data-testid="mj-context-menu-root"]')).toBeNull();
  });

  it('positions root menu cleanly in two phases via requestAnimationFrame without clipping', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);

    const f = renderComponentFixture(MjContextMenuComponent<DemoCommand>, {
      imports: [CommonModule],
      declarations: [MjContextMenuComponent],
      inputs: {
        IsOpen: true,
        AnchorX: 1240,
        AnchorY: 760,
        Items: BASE_ITEMS,
        AriaLabel: 'Edge Test',
      },
    });

    const root = query(f, '[data-testid="mj-context-menu-root"]') as HTMLElement;
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      top: 760,
      left: 1240,
      right: 1460,
      bottom: 1060,
      width: 220,
      height: 300,
      x: 1240,
      y: 760,
      toJSON: () => ({}),
    });

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    f.detectChanges();

    expect(root.style.opacity).toBe('');
    expect(parseFloat(root.style.left)).toBe(1020);
    expect(parseFloat(root.style.top)).toBe(460);
  });

  it('opens submenu after 140ms hover intent and respects safe-triangle corridor', () => {
    vi.useFakeTimers();
    try {
      const f = renderMenu();
      const formatBtn = query(f, '[data-testid="mj-context-menu-item-format"]') as HTMLElement;
      formatBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));

      // Not open yet before 140ms
      expect(query(f, '[data-testid="mj-context-menu-submenu-format"]')).toBeNull();

      vi.advanceTimersByTime(140);
      f.detectChanges();
      const subPanel = query(f, '[data-testid="mj-context-menu-submenu-format"]') as HTMLElement;
      expect(subPanel).not.toBeNull();

      vi.spyOn(subPanel, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 300,
        right: 500,
        bottom: 320,
        width: 200,
        height: 220,
        x: 300,
        y: 100,
        toJSON: () => ({}),
      });

      const rootPanel = query(f, '[data-testid="mj-context-menu-root"]') as HTMLElement;
      rootPanel.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 180 }));
      rootPanel.dispatchEvent(new MouseEvent('mousemove', { clientX: 220, clientY: 195 }));

      // Hovering sibling while moving diagonally inside safe triangle defers collapse for 180ms
      const gridBtn = query(f, '[data-testid="mj-context-menu-item-show-gridlines"]') as HTMLElement;
      gridBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      expect(query(f, '[data-testid="mj-context-menu-submenu-format"]')).not.toBeNull();

      vi.advanceTimersByTime(180);
      f.detectChanges();
      expect(query(f, '[data-testid="mj-context-menu-submenu-format"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('dismisses on window resize', () => {
    const f = renderMenu();
    const closed = vi.fn();
    f.componentInstance.Closed.subscribe(closed);
    window.dispatchEvent(new Event('resize'));
    expect(closed).toHaveBeenCalledTimes(1);
    expect(query(f, '[data-testid="mj-context-menu-root"]')).toBeNull();
  });

  it('dismisses on window blur', () => {
    const f = renderMenu();
    const closed = vi.fn();
    f.componentInstance.Closed.subscribe(closed);
    window.dispatchEvent(new Event('blur'));
    expect(closed).toHaveBeenCalledTimes(1);
    expect(query(f, '[data-testid="mj-context-menu-root"]')).toBeNull();
  });

  it('restores focus to RestoreFocusElement when activating a command before emitting ItemSelected', () => {
    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [MjContextMenuComponent, TestEscapeHostComponent],
    });
    const f = TestBed.createComponent(TestEscapeHostComponent);
    f.detectChanges();

    const triggerEl = query(f, '[data-testid="trigger-el"]') as HTMLElement;
    const callOrder: string[] = [];
    vi.spyOn(triggerEl, 'focus').mockImplementation(() => {
      callOrder.push('focus');
    });
    const originalOnSelect = f.componentInstance.OnSelect.bind(f.componentInstance);
    vi.spyOn(f.componentInstance, 'OnSelect').mockImplementation((cmd: DemoCommand) => {
      callOrder.push(`select:${cmd.Type}`);
      originalOnSelect(cmd);
    });

    f.componentInstance.OpenMenu(triggerEl);
    f.detectChanges();

    const copyBtn = query(f, '[data-testid="mj-context-menu-item-copy"]') as HTMLButtonElement;
    copyBtn.click();
    f.detectChanges();

    expect(f.componentInstance.SelectedCommands).toEqual([{ Type: 'copy' }]);
    expect(callOrder).toEqual(['focus', 'select:copy']);
  });

  it('preserves pending initial root panel focus across AnchorX/AnchorY reanchor updates before rAF', async () => {
    const f = renderMenu();

    // Update anchor coordinates right after opening (triggers reanchorRootMenu before rAF runs)
    f.componentRef.setInput('AnchorX', 180);
    f.componentRef.setInput('AnchorY', 210);
    f.detectChanges();

    const root = query(f, '[data-testid="mj-context-menu-root"]') as HTMLElement;
    const panelFocusSpy = vi.spyOn(root, 'focus');

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    f.detectChanges();

    expect(panelFocusSpy).toHaveBeenCalledTimes(1);
  });

  it('passes $event into OnItemMouseEnter and extends hoverSwitchTimer while moving inside safe triangle', () => {
    vi.useFakeTimers();
    try {
      const f = renderMenu();
      const formatBtn = query(f, '[data-testid="mj-context-menu-item-format"]') as HTMLElement;
      formatBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: 120, clientY: 160 }));

      vi.advanceTimersByTime(140);
      f.detectChanges();
      const subPanel = query(f, '[data-testid="mj-context-menu-submenu-format"]') as HTMLElement;
      expect(subPanel).not.toBeNull();

      vi.spyOn(subPanel, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 300,
        right: 500,
        bottom: 320,
        width: 200,
        height: 220,
        x: 300,
        y: 100,
        toJSON: () => ({}),
      });

      const rootPanel = query(f, '[data-testid="mj-context-menu-root"]') as HTMLElement;
      rootPanel.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 180 }));

      // Hover sibling with mouseenter coordinates inside safe triangle (no preceding mousemove for 2nd point)
      const gridBtn = query(f, '[data-testid="mj-context-menu-item-show-gridlines"]') as HTMLElement;
      gridBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: 210, clientY: 190 }));
      expect(query(f, '[data-testid="mj-context-menu-submenu-format"]')).not.toBeNull();

      // Advance 100ms, then move again within the safe triangle: timer should extend by another 180ms
      vi.advanceTimersByTime(100);
      rootPanel.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 198 }));

      // At t=180ms (only 80ms since last safe-triangle move), submenu must still be open
      vi.advanceTimersByTime(80);
      f.detectChanges();
      expect(query(f, '[data-testid="mj-context-menu-submenu-format"]')).not.toBeNull();

      // At t=280ms (180ms after last move), deferred switch completes
      vi.advanceTimersByTime(100);
      f.detectChanges();
      expect(query(f, '[data-testid="mj-context-menu-submenu-format"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls scrollIntoView({ block: "nearest" }) when keyboard navigation focuses an item', () => {
    const f = renderMenu();
    const cutBtn = query(f, '[data-testid="mj-context-menu-item-cut"]') as HTMLElement;
    const scrollMock = vi.fn();
    cutBtn.scrollIntoView = scrollMock;

    dispatchKey('ArrowDown');
    expect(scrollMock).toHaveBeenCalledWith({ block: 'nearest' });
  });
});
