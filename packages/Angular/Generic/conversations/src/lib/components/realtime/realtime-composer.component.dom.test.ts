import { describe, it, expect, afterEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import {
  renderComponentFixture,
  query,
  queryAll,
  capture,
  click,
  typeInto,
  overlayQuery,
  overlayQueryAll,
  clearOverlayContainers,
  ExpectNoAxeViolations,
} from '@memberjunction/ng-test-utils';
import { MediaControlsComponent, type MediaSharePanel } from '@memberjunction/ng-realtime-media';
import type { MediaDevice } from '@memberjunction/ai-realtime-client/media';
import { RealtimeComposerComponent } from './realtime-composer.component';
import { RealtimeSessionService } from '../../services/realtime-session.service';

/**
 * DOM spec for <mj-realtime-composer> — the call overlay's bottom dock. The component
 * injects RealtimeSessionService but only calls it in click handlers (ToggleMute /
 * SendText), so a minimal stub satisfies DI while the @Inputs drive both shapes:
 * the call bar (not typing, at full width or Compact) and the fused typing dock (Open).
 *
 * The controls are the design system's: the microphone, camera and Share are mj-media-controls, the rest mjButton
 * circles, and More an mj-menu (a CDK menu, rendered in the overlay container). The mic itself is not media here —
 * mute is a pure local toggle on the stub — so no WebRTC/getUserMedia is faked.
 */
describe('RealtimeComposerComponent (DOM)', () => {
  // Minimal seam stub — the component only invokes these two in event handlers, never during render.
  const makeService = (toggleMuteReturns = true) =>
    ({
      ToggleMute: () => toggleMuteReturns,
      SendText: (_text: string) => undefined,
    }) satisfies Pick<RealtimeSessionService, 'ToggleMute' | 'SendText'>;

  const render = (inputs: Record<string, unknown> = {}, service = makeService()) =>
    renderComponentFixture(RealtimeComposerComponent, {
      imports: [CommonModule, FormsModule, RealtimeComposerComponent],
      providers: [{ provide: RealtimeSessionService, useValue: service }],
      inputs,
    });
  type Fixture = ReturnType<typeof render>;

  const DEVICES: MediaDevice[] = [
    { DeviceID: 'mic-built-in', Kind: 'microphone', Label: 'Built-in Microphone', GroupID: 'laptop' },
    { DeviceID: 'mic-headset', Kind: 'microphone', Label: 'USB Headset', GroupID: 'headset' },
    { DeviceID: 'cam-built-in', Kind: 'camera', Label: 'Built-in Camera', GroupID: 'laptop' },
  ];
  const CHOOSE = 'button[title="Choose microphone and camera"]';
  const MORE = 'button[aria-label="More call controls"]';
  const TYPE = '[aria-label="Open the typed-input composer"]';
  const END = '[aria-label="End call"]';
  const CAPTIONS = '[aria-label="Captions"]';
  const DETAILS_TITLES = ['Peek at the session panels', 'Hide the session panels', 'Show the session panels'];

  const layouts: Array<[string, Record<string, unknown>]> = [
    ['the full-width bar', {}],
    ['the compact bar', { Compact: true }],
  ];
  const allLayouts: Array<[string, Record<string, unknown>]> = [...layouts, ['the fused dock', { Open: true }]];

  const controls = (f: Fixture) => f.debugElement.query(By.directive(MediaControlsComponent)).componentInstance as MediaControlsComponent;
  const moreMenu = () => overlayQuery('mj-menu[aria-label="More call controls"]') as HTMLElement | null;
  const menuLabels = (menu = 'mj-menu[aria-label="More call controls"]') =>
    (overlayQueryAll(`${menu} mj-menu-item`) as HTMLElement[]).map((item) => item.textContent?.trim());
  const menuItem = (label: string, menu = 'mj-menu') =>
    (overlayQueryAll(`${menu} mj-menu-item`) as HTMLElement[]).find((item) => item.textContent?.trim() === label) as HTMLElement;
  const openMore = (f: Fixture) => {
    click(f, MORE);
    f.detectChanges();
  };
  /** A keydown as a browser sends it: the CDK menu reads the legacy `keyCode`. */
  const escape = (target: HTMLElement) => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { value: 27 });
    target.dispatchEvent(event);
  };

  afterEach(() => clearOverlayContainers());

  describe('shape', () => {
    it('renders the call bar when not open, at full width and Compact', () => {
      const f = render();
      expect(query(f, '.bar')).not.toBeNull();
      expect(query(f, '.bar--compact')).toBeNull();
      expect(query(f, '.dock')).toBeNull();
      f.componentRef.setInput('Compact', true);
      f.detectChanges();
      expect(query(f, '.bar.bar--compact')).not.toBeNull();
    });

    it('renders the fused dock (with the text input) when Open is true', () => {
      const f = render({ Open: true });
      expect(query(f, '.dock')).not.toBeNull();
      expect(query(f, '.dock__input')).not.toBeNull();
      expect(query(f, '.bar')).toBeNull();
    });
  });

  describe('the call bar', () => {
    it.each(layouts)('in %s shows mic (with device menu), camera, captions, More and End, and no Details, Type or Share', (_name, inputs) => {
      const f = render({ ...inputs, ShowCamera: true, ShowShare: true, ShowDetails: true, Devices: DEVICES });
      expect(query(f, `.bar mj-media-controls .microphone ${CHOOSE}`)).not.toBeNull();
      expect(query(f, '.bar button[title="Mute microphone"]')).not.toBeNull();
      expect(query(f, '.bar button[title="Turn on camera"]')).not.toBeNull();
      expect(query(f, `.bar ${CAPTIONS}`)).not.toBeNull();
      expect(query(f, `.bar ${MORE}`)).not.toBeNull();
      expect(query(f, `.bar ${END}`)).not.toBeNull();
      expect(query(f, `.bar ${TYPE}`)).toBeNull();
      expect(query(f, '.bar button[title="Share screen"]')).toBeNull();
      expect(query(f, '.bar button[title="Choose what to share"]')).toBeNull();
      expect(queryAll(f, '.bar button').map((b) => b.getAttribute('title'))).not.toEqual(expect.arrayContaining(DETAILS_TITLES));
    });

    it('orders the controls mic, camera, share, captions, More, End', () => {
      const f = render({ ShowCamera: true, ShowShare: true, Sharing: true });
      expect(queryAll(f, '.bar button').map((b) => b.getAttribute('aria-label'))).toEqual([
        'Mute microphone',
        'Turn on camera',
        'Stop sharing',
        'Captions',
        'More call controls',
        'End call',
      ]);
    });

    it('shows the camera whenever the call offers it, neutral while off, and not otherwise', () => {
      const f = render({ ShowCamera: false });
      expect(query(f, '.bar button[title="Turn on camera"]')).toBeNull();
      f.componentRef.setInput('ShowCamera', true);
      f.detectChanges();
      expect(query(f, '.bar button[title="Turn on camera"]')?.classList.contains('mj-btn--secondary')).toBe(true);
      f.componentRef.setInput('CameraOn', true);
      f.detectChanges();
      expect(query(f, '.bar button[title="Turn off camera"]')).not.toBeNull();
    });

    it('puts Share in the bar only while sharing, so the user can stop it', () => {
      const f = render({ ShowShare: true, Sharing: false });
      expect(query(f, '.bar button[title="Share screen"]')).toBeNull();
      f.componentRef.setInput('Sharing', true);
      f.detectChanges();
      const stops = capture(f.componentInstance.StopShareRequested);
      click(f, '.bar button[title="Stop sharing"]');
      expect(stops).toHaveLength(1);
    });

    it('names each control beneath it at full width', () => {
      const f = render({ ShowCamera: true, ShowShare: true, Sharing: true });
      expect(queryAll(f, '.bar .control__label, .bar .ctrl-label').map((l) => l.textContent?.trim())).toEqual([
        'Mute',
        'Video',
        'Stop sharing',
        'Captions',
        'More',
        'End call',
      ]);
    });

    it('drops the labels when Compact', () => {
      const f = render({ Compact: true, ShowCamera: true });
      expect(queryAll(f, '.bar .control__label, .bar .ctrl-label')).toEqual([]);
    });

    it('draws large circles, the captions toggle pressed while on and End red', () => {
      const f = render({ CaptionsOn: true });
      const circles = queryAll(f, '.bar button').filter((b) => !b.classList.contains('microphone__devices'));
      expect(circles.every((b) => b.classList.contains('mj-btn--circle') && b.classList.contains('mj-btn--lg'))).toBe(true);
      const captions = query(f, `.bar ${CAPTIONS}`);
      expect(captions?.getAttribute('aria-pressed')).toBe('true');
      expect(captions?.classList.contains('mj-btn--selected')).toBe(true);
      expect(query(f, `.bar ${END}`)?.classList.contains('mj-btn--danger')).toBe(true);
    });

    it('reflects the muted state on the microphone, named by what a click does', () => {
      const f = render({ IsMuted: true });
      const mic = query(f, '.bar mj-media-controls button[title="Unmute microphone"]');
      expect(mic?.classList.contains('mj-btn--danger')).toBe(true);
      expect(mic?.querySelector('i')?.classList.contains('fa-microphone-slash')).toBe(true);
      expect(query(f, '.bar mj-media-controls .control__label')?.textContent?.trim()).toBe('Unmute');
    });

    it.each(layouts)('toggles mute through the service and emits the new state in %s', (_name, inputs) => {
      const f = render({ ...inputs, IsMuted: false }, makeService(true));
      const muteChanges = capture(f.componentInstance.MuteChanged);
      click(f, '.bar button[title="Mute microphone"]');
      expect(muteChanges).toEqual([true]);
      expect(f.componentInstance.IsMuted).toBe(true);
    });

    it.each(layouts)('toggles captions and ends the call from %s', (_name, inputs) => {
      const f = render({ ...inputs, CaptionsOn: false });
      const toggles = capture(f.componentInstance.CaptionsToggled);
      const ended = capture(f.componentInstance.EndRequested);
      click(f, `.bar ${CAPTIONS}`);
      click(f, `.bar ${END}`);
      expect(toggles).toEqual([true]);
      expect(ended).toHaveLength(1);
    });

    it('passes the camera request up', () => {
      const f = render({ ShowCamera: true, CameraOn: true });
      const toggles = capture(f.componentInstance.CameraToggled);
      click(f, '.bar button[title="Turn off camera"]');
      expect(toggles).toEqual([false]);
    });

    it.each(allLayouts)('never renders Details in %s, even with ShowDetails true', (_name, inputs) => {
      const f = render({ ...inputs, ShowDetails: true, DetailsOn: true });
      expect(queryAll(f, 'button').filter((b) => DETAILS_TITLES.includes(b.getAttribute('title') ?? ''))).toHaveLength(0);
      expect(query(f, '.fa-table-columns')).toBeNull();
    });

    it('has no axe violations', async () => {
      const f = render({ ShowCamera: true, Devices: DEVICES });
      await ExpectNoAxeViolations(f);
    });
  });

  describe('the More menu', () => {
    it('opens a role=menu with "Share your screen" and "Type a message", and marks More expanded', () => {
      const f = render({ ShowShare: true });
      const more = query(f, MORE) as HTMLButtonElement;
      expect(more.getAttribute('aria-expanded')).toBe('false');
      openMore(f);
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect(moreMenu()?.getAttribute('role')).toBe('menu');
      expect(menuLabels()).toEqual(['Share your screen', 'Type a message']);
      expect((overlayQueryAll('mj-menu-item') as HTMLElement[]).every((item) => item.getAttribute('role') === 'menuitem')).toBe(true);
    });

    it('picking "Type a message" emits OpenChanged(true) and closes the menu', () => {
      const f = render();
      const openChanges = capture(f.componentInstance.OpenChanged);
      openMore(f);
      menuItem('Type a message').click();
      f.detectChanges();
      expect(openChanges).toEqual([true]);
      expect(moreMenu()).toBeNull();
      expect(f.componentInstance.MoreOpen).toBe(false);
    });

    it('closes on Escape', () => {
      const f = render();
      openMore(f);
      escape(menuItem('Type a message'));
      f.detectChanges();
      expect(moreMenu()).toBeNull();
    });

    it('closes on a click outside', () => {
      const f = render();
      openMore(f);
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      f.detectChanges();
      expect(moreMenu()).toBeNull();
    });

    it('offers "Share your screen" only while the call offers a share and the user is not sharing', () => {
      const f = render({ ShowShare: true, Sharing: true });
      openMore(f);
      expect(menuLabels()).toEqual(['Type a message']);
    });

    it.each<[string, Record<string, unknown>]>([
      ['no share offered and typing not allowed (full width)', { ShowShare: false, AllowTyping: false }],
      ['no share offered and typing not allowed (Compact)', { ShowShare: false, AllowTyping: false, Compact: true }],
      ['already sharing and typing not allowed', { ShowShare: true, Sharing: true, AllowTyping: false }],
    ])('is hidden when it has no items: %s', (_name, inputs) => {
      const f = render({ ...inputs, ShowDetails: true, ShowCamera: true });
      expect(query(f, MORE)).toBeNull();
      expect(f.componentInstance.HasMoreItems).toBe(false);
    });

    it("opens the browser's own share picker in one click, with no surface preference", () => {
      const f = render({ ShowShare: true });
      const shares = capture(f.componentInstance.ShareRequested);
      openMore(f);
      expect(menuLabels()).toEqual(['Share your screen', 'Type a message']);
      menuItem('Share your screen').click();
      f.detectChanges();
      expect(shares).toEqual([{ Kind: 'display' }]);
      expect(moreMenu()).toBeNull();
    });

    it("offers the overlay's panels under Share a panel, only when there are some, and asks for the picked one", () => {
      const panels: MediaSharePanel[] = [{ Key: 'share-panel-1', Label: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' }];
      const f = render({ ShowShare: true, SharePanels: panels, Compact: true });
      const shares = capture(f.componentInstance.ShareRequested);
      openMore(f);
      expect(menuLabels()).toEqual(['Share your screen', 'Share a panel', 'Type a message']);
      menuItem('Share a panel').click();
      f.detectChanges();
      menuItem('Whiteboard', 'mj-menu[aria-label="This panel"]').click();
      expect(shares).toEqual([{ Kind: 'panel', PanelKey: 'share-panel-1' }]);
    });
  });

  describe('the device chevron (#5371)', () => {
    it('sits on the microphone in the bar at both widths, and not in the fused dock, which is short of room', () => {
      const f = render({ Devices: DEVICES });
      expect(query(f, `.bar mj-media-controls .microphone ${CHOOSE}`)).not.toBeNull();
      f.componentRef.setInput('Compact', true);
      f.detectChanges();
      expect(query(f, `.bar mj-media-controls .microphone ${CHOOSE}`)).not.toBeNull();
      f.componentRef.setInput('Open', true);
      f.detectChanges();
      expect(query(f, '.dock mj-media-controls')).not.toBeNull();
      expect(query(f, CHOOSE)).toBeNull();
    });

    it('has none while the overlay lists no device', () => {
      const f = render();
      expect(query(f, '.bar mj-media-controls .microphone__devices')).toBeNull();
    });

    it("gives the controls the overlay's devices and picks, and passes the user's pick up", () => {
      const f = render({ Devices: DEVICES, SelectedMicrophoneID: 'mic-built-in', SelectedCameraID: 'cam-built-in' });
      expect(controls(f).Devices).toEqual(DEVICES);
      expect(controls(f).SelectedMicrophoneID).toBe('mic-built-in');
      expect(controls(f).SelectedCameraID).toBe('cam-built-in');
      const picks = capture(f.componentInstance.DeviceSelected);
      click(f, `.bar ${CHOOSE}`);
      f.detectChanges();
      const microphone = query(f, '.bar .devices select') as HTMLSelectElement;
      microphone.value = 'mic-headset';
      microphone.dispatchEvent(new Event('change'));
      expect(picks).toEqual([{ Kind: 'microphone', DeviceID: 'mic-headset' }]);
    });
  });

  describe('the fused dock', () => {
    it('draws small circles and no labels, without Details', () => {
      const f = render({ Open: true, ShowDetails: true });
      const circles = queryAll(f, '.dock button.mj-btn--circle');
      expect(circles.length).toBe(4); // microphone, captions, hide, end
      expect(circles.every((b) => b.classList.contains('mj-btn--sm'))).toBe(true);
      expect(queryAll(f, '.dock .control__label')).toEqual([]);
    });

    it('toggles mute', () => {
      const dock = render({ Open: true, IsMuted: true }, makeService(false));
      const dockChanges = capture(dock.componentInstance.MuteChanged);
      click(dock, '.dock button[title="Unmute microphone"]');
      expect(dockChanges).toEqual([false]);
    });

    it('passes the camera and share requests up, and drops the Share arrow and panels', () => {
      const f = render({ Open: true, ShowCamera: true, ShowShare: true, CameraOn: true, Sharing: true, SharePanels: [{ Key: 'k', Label: 'Whiteboard' }] });
      const toggles = capture(f.componentInstance.CameraToggled);
      const stops = capture(f.componentInstance.StopShareRequested);
      click(f, '.dock button[title="Turn off camera"]');
      click(f, '.dock button[title="Stop sharing"]');
      expect(toggles).toEqual([false]);
      expect(stops).toHaveLength(1);
      expect(controls(f).SharePanels).toEqual([]);
      f.componentRef.setInput('Sharing', false);
      f.detectChanges();
      expect(query(f, '.dock button[title="Share screen"]')).not.toBeNull();
      expect(query(f, '.dock button[title="Choose what to share"]')).toBeNull();
    });

    it('disables Send until there is non-whitespace draft text', () => {
      const f = render({ Open: true });
      expect((query(f, '.dock__send') as HTMLButtonElement).disabled).toBe(true);
      // Type through the real [(ngModel)] input so Draft updates via the component's own binding
      // (a direct Draft assignment + strict detectChanges trips NG0100 on the disabled expression).
      typeInto(f, '.dock__input', 'hello');
      f.detectChanges();
      expect((query(f, '.dock__send') as HTMLButtonElement).disabled).toBe(false);
    });

    it('emits OpenChanged(false) from the hide control', () => {
      const f = render({ Open: true });
      const openChanges = capture(f.componentInstance.OpenChanged);
      click(f, '.dock__hide');
      expect(openChanges).toEqual([false]);
    });

    it('keeps the hide control and Send when AllowTyping is false and the dock is already open', () => {
      const f = render({ Open: true, AllowTyping: false });
      expect(query(f, '[aria-label="Close the typed-input composer"]')).not.toBeNull();
      expect(query(f, '.dock__send')).not.toBeNull();
    });
  });

  describe('host switches (#6101)', () => {
    it.each(layouts)('drops "Type a message" from More in %s when AllowTyping is false, and keeps mute, Captions and End', (_name, inputs) => {
      const f = render({ ...inputs, AllowTyping: false, ShowShare: true });
      openMore(f);
      expect(menuLabels()).toEqual(['Share your screen']);
      expect(query(f, CAPTIONS)).not.toBeNull();
      expect(query(f, END)).not.toBeNull();
      expect(query(f, 'mj-media-controls')).not.toBeNull();
    });

    it.each(allLayouts)('hides End in %s when ShowEnd is false', (_name, inputs) => {
      expect(queryAll(render({ ...inputs, ShowEnd: false }), END)).toHaveLength(0);
    });

    it.each(allLayouts)('hides Captions in %s when ShowCaptionsControl is false', (_name, inputs) => {
      expect(queryAll(render({ ...inputs, ShowCaptionsControl: false }), CAPTIONS)).toHaveLength(0);
    });
  });
});
