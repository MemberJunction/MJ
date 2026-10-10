import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  renderComponentFixture,
  query,
  queryAll,
  overlayQuery,
  overlayQueryAll,
  clearOverlayContainers,
  ExpectNoAxeViolations,
} from '@memberjunction/ng-test-utils';
import type { MediaDevice, MediaDeviceSelection } from '@memberjunction/ai-realtime-client/media';
import { MediaControlsComponent, type MediaShareRequest } from './media-controls.component';

afterEach(() => {
  clearOverlayContainers();
});

/**
 * DOM spec for <mj-media-controls>: the buttons' names and looks follow the state, each click asks for the
 * opposite, and the split Share button asks with no preference, for a picked kind of surface, or for a host's panel.
 */
describe('MediaControlsComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(MediaControlsComponent, { inputs: { ...inputs } });
  const button = (f: ReturnType<typeof render>, title: string) => query(f, `button[title="${title}"]`) as HTMLButtonElement | null;
  const menuLabels = (selector = 'mj-menu') =>
    (overlayQueryAll(`${selector} mj-menu-item`) as HTMLElement[]).map((item) => item.querySelector('.mj-menu-item-label')?.textContent?.trim());
  const menuItem = (label: string) =>
    (overlayQueryAll('mj-menu-item') as HTMLElement[]).find((item) => item.querySelector('.mj-menu-item-label')?.textContent?.trim() === label) as HTMLElement;
  const shareRequests = (f: ReturnType<typeof render>) => {
    const requests: MediaShareRequest[] = [];
    f.componentInstance.ShareRequested.subscribe((request: MediaShareRequest) => requests.push(request));
    return requests;
  };
  const openShareMenu = (f: ReturnType<typeof render>) => {
    button(f, 'Choose what to share')?.click();
    f.detectChanges();
  };

  it('names each button by what a click does, red while the microphone or camera is off', () => {
    const f = render({ MicrophoneOn: true, CameraOn: false });
    const mic = button(f, 'Mute microphone');
    const camera = button(f, 'Turn on camera');
    expect(mic?.getAttribute('aria-label')).toBe('Mute microphone');
    expect(mic?.classList.contains('mj-btn--secondary')).toBe(true);
    expect(mic?.querySelector('.fa-microphone')).not.toBeNull();
    expect(camera?.classList.contains('mj-btn--danger')).toBe(true);
    expect(camera?.querySelector('.fa-video-slash')).not.toBeNull();
    expect(queryAll(f, 'button').every((b) => b.classList.contains('mj-btn--circle'))).toBe(true);
  });

  it('asks for the opposite state when the microphone or camera is clicked', () => {
    const f = render({ MicrophoneOn: true, CameraOn: false });
    const mic = vi.fn();
    const camera = vi.fn();
    f.componentInstance.MicrophoneToggled.subscribe(mic);
    f.componentInstance.CameraToggled.subscribe(camera);
    button(f, 'Mute microphone')?.click();
    button(f, 'Turn on camera')?.click();
    expect(mic).toHaveBeenCalledWith(false);
    expect(camera).toHaveBeenCalledWith(true);
  });

  it('asks to share with no preference from the main part of Share', () => {
    const f = render();
    const requests = shareRequests(f);
    button(f, 'Share screen')?.click();
    expect(requests).toEqual([{ Kind: 'display' }]);
  });

  it('offers an entire screen, a window and a browser tab from the arrow, and asks for the picked kind first', () => {
    const f = render();
    const requests = shareRequests(f);
    openShareMenu(f);
    expect(overlayQuery('mj-menu')?.getAttribute('aria-label')).toBe('Share');
    expect(menuLabels()).toEqual(['Entire screen', 'Window', 'Browser tab']);
    expect(overlayQuery('mj-menu-divider')).toBeNull();
    menuItem('Window').click();
    f.detectChanges();
    expect(requests).toEqual([{ Kind: 'display', PreferredSurface: 'window' }]);
    expect(overlayQuery('mj-menu')).toBeNull();
  });

  it("offers the host's panels under This panel, and asks for the picked panel", () => {
    const f = render({
      SharePanels: [
        { Key: 'Whiteboard', Label: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' },
        { Key: 'Browser', Label: 'Remote browser' },
      ],
    });
    const requests = shareRequests(f);
    openShareMenu(f);
    expect(menuLabels()).toEqual(['Entire screen', 'Window', 'Browser tab', 'This panel']);
    expect(menuItem('This panel').getAttribute('aria-haspopup')).toBe('menu');
    menuItem('This panel').click();
    f.detectChanges();
    expect(menuLabels('mj-menu[aria-label="This panel"]')).toEqual(['Whiteboard', 'Remote browser']);
    menuItem('Remote browser').click();
    f.detectChanges();
    expect(requests).toEqual([{ Kind: 'panel', PanelKey: 'Browser' }]);
  });

  it('while sharing, the main part stops sharing and the arrow is gone', () => {
    const f = render({ Sharing: true });
    const requests = shareRequests(f);
    const stop = vi.fn();
    f.componentInstance.StopShareRequested.subscribe(stop);
    const share = button(f, 'Stop sharing');
    expect(share?.classList.contains('mj-btn--primary')).toBe(true);
    expect(button(f, 'Choose what to share')).toBeNull();
    share?.click();
    expect(stop).toHaveBeenCalledOnce();
    expect(requests).toEqual([]);
  });

  it('leaves out the microphone, the camera and the arrow when their gates are off', () => {
    const f = render({ ShowMicrophone: false, ShowCamera: false, ShowShareMenu: false });
    expect(queryAll(f, 'button').map((b) => b.getAttribute('title'))).toEqual(['Share screen']);
  });

  it('leaves out Share when its gate is off', () => {
    const f = render({ ShowShare: false });
    expect(queryAll(f, 'button').map((b) => b.getAttribute('title'))).toEqual(['Unmute microphone', 'Turn on camera']);
  });

  it('draws every circle at the size asked for, and keeps the Share arrow small', () => {
    const f = render({ Size: 'lg' });
    const sizes = queryAll(f, 'button').map((b) => [b.getAttribute('title'), b.classList.contains('mj-btn--lg'), b.classList.contains('mj-btn--sm')]);
    expect(sizes).toEqual([
      ['Unmute microphone', true, false],
      ['Turn on camera', true, false],
      ['Share screen', true, false],
      ['Choose what to share', false, true],
    ]);
  });

  it('labels each control beneath it when asked, by what it does', () => {
    const f = render({ ShowLabels: true, MicrophoneOn: true, CameraOn: false, Sharing: false });
    expect(queryAll(f, '.control__label').map((l) => l.textContent?.trim())).toEqual(['Mute', 'Video', 'Share']);
    f.componentRef.setInput('MicrophoneOn', false);
    f.componentRef.setInput('CameraOn', true);
    f.componentRef.setInput('Sharing', true);
    f.detectChanges();
    expect(queryAll(f, '.control__label').map((l) => l.textContent?.trim())).toEqual(['Unmute', 'Stop video', 'Stop sharing']);
    expect(queryAll(f, '.control__label').every((l) => l.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('keeps an optional camera neutral while off and fills it while on, the microphone still red while off', () => {
    const f = render({ CameraOptional: true, CameraOn: false, MicrophoneOn: false });
    const camera = () => button(f, f.componentInstance.CameraOn ? 'Turn off camera' : 'Turn on camera');
    expect(camera()?.classList.contains('mj-btn--secondary')).toBe(true);
    expect(camera()?.classList.contains('mj-btn--danger')).toBe(false);
    expect(button(f, 'Unmute microphone')?.classList.contains('mj-btn--danger')).toBe(true);
    f.componentRef.setInput('CameraOn', true);
    f.detectChanges();
    expect(camera()?.classList.contains('mj-btn--primary')).toBe(true);
  });

  describe('the agent-vision button', () => {
    const LET = 'Let the agent see your camera and screen';
    const STOP = 'Stop letting the agent see your camera and screen';

    it('is there only when the host shows it', () => {
      expect(button(render(), LET)).toBeNull();
      expect(button(render({ ShowAgentVision: true }), LET)).not.toBeNull();
    });

    it('is off by default: neutral, an eye with a slash', () => {
      const vision = button(render({ ShowAgentVision: true }), LET);
      expect(vision?.classList.contains('mj-btn--secondary')).toBe(true);
      expect(vision?.querySelector('i')?.classList.contains('fa-eye-slash')).toBe(true);
    });

    it('is filled while on, and named by what a click does', () => {
      const vision = button(render({ ShowAgentVision: true, AgentVisionOn: true }), STOP);
      expect(vision?.classList.contains('mj-btn--primary')).toBe(true);
      expect(vision?.querySelector('i')?.classList.contains('fa-eye')).toBe(true);
    });

    it('asks for the opposite state when clicked', () => {
      const f = render({ ShowAgentVision: true });
      const asked: boolean[] = [];
      f.componentInstance.AgentVisionToggled.subscribe((on: boolean) => asked.push(on));
      button(f, LET)?.click();
      f.componentRef.setInput('AgentVisionOn', true);
      f.detectChanges();
      button(f, STOP)?.click();
      expect(asked).toEqual([true, false]);
    });

    it('is labelled after Share when labels are on', () => {
      const f = render({ ShowLabels: true, ShowAgentVision: true });
      expect(queryAll(f, '.control__label').map((l) => l.textContent?.trim())).toEqual(['Unmute', 'Video', 'Share', 'Show agent']);
      f.componentRef.setInput('AgentVisionOn', true);
      f.detectChanges();
      expect(queryAll(f, '.control__label').map((l) => l.textContent?.trim()).at(-1)).toBe('Hide from agent');
    });

    it('has no axe violations', async () => {
      await ExpectNoAxeViolations(render({ ShowAgentVision: true, AgentVisionOn: true, ShowLabels: true }));
    });
  });

  describe('the device chevron (#5371)', () => {
    const MICROPHONES: MediaDevice[] = [
      { DeviceID: 'mic-built-in', Kind: 'microphone', Label: 'Built-in Microphone', GroupID: 'laptop' },
      { DeviceID: 'mic-headset', Kind: 'microphone', Label: 'USB Headset', GroupID: 'headset' },
    ];
    const CAMERAS: MediaDevice[] = [
      { DeviceID: 'cam-built-in', Kind: 'camera', Label: 'Built-in Camera', GroupID: 'laptop' },
      { DeviceID: 'cam-desk', Kind: 'camera', Label: 'Desk Camera', GroupID: 'desk' },
    ];
    const SPEAKER: MediaDevice = { DeviceID: 'speaker-built-in', Kind: 'speaker', Label: 'Built-in Speakers', GroupID: 'laptop' };
    const CHOOSE = 'Choose microphone and camera';

    /** Controls whose host offers the device menu, with two microphones, two cameras and a speaker, and the picked ones. */
    const withDevices = (inputs: Record<string, unknown> = {}) =>
      render({
        ShowDeviceMenu: true,
        MicrophoneOn: true,
        Devices: [...MICROPHONES, ...CAMERAS, SPEAKER],
        SelectedMicrophoneID: 'mic-built-in',
        SelectedCameraID: 'cam-desk',
        ...inputs,
      });
    const openDeviceMenu = (f: ReturnType<typeof render>) => {
      button(f, CHOOSE)?.click();
      f.detectChanges();
    };
    const deviceMenu = (f: ReturnType<typeof render>) => query(f, '.devices mj-media-device-menu');
    const selects = (f: ReturnType<typeof render>) => queryAll(f, '.devices select') as HTMLSelectElement[];
    const options = (select: HTMLSelectElement) => Array.from(select.options).map((o) => o.textContent?.trim());

    it('is there only when the host asks for it and lists a device to pick', () => {
      expect(button(render({ Devices: MICROPHONES }), 'Choose microphone')).toBeNull();
      expect(button(render({ ShowDeviceMenu: true }), 'Choose microphone')).toBeNull();
      expect(button(render({ ShowDeviceMenu: true, Devices: [SPEAKER] }), 'Choose microphone')).toBeNull();
      const chevron = button(render({ ShowDeviceMenu: true, Devices: MICROPHONES }), 'Choose microphone');
      expect(chevron?.getAttribute('aria-label')).toBe('Choose microphone');
      expect(chevron?.getAttribute('aria-expanded')).toBe('false');
      expect(chevron?.querySelector('.fa-chevron-up')).not.toBeNull();
    });

    it('sits beside the microphone as one control, small, with no label of its own', () => {
      const f = withDevices({ Size: 'lg', ShowLabels: true });
      expect(queryAll(f, 'button').map((b) => b.getAttribute('title'))).toEqual([
        'Mute microphone',
        CHOOSE,
        'Turn on camera',
        'Share screen',
        'Choose what to share',
      ]);
      expect(query(f, '.microphone')?.contains(button(f, CHOOSE))).toBe(true);
      expect(button(f, CHOOSE)?.classList.contains('mj-btn--sm')).toBe(true);
      expect(queryAll(f, '.control__label').map((l) => l.textContent?.trim())).toEqual(['Mute', 'Video', 'Share']);
    });

    it('goes with the microphone when its gate is off', () => {
      expect(button(withDevices({ ShowMicrophone: false }), CHOOSE)).toBeNull();
    });

    it('opens the device menu with the microphones and the cameras, the picked ones selected, and no speakers', async () => {
      const f = withDevices();
      expect(deviceMenu(f)).toBeNull();
      openDeviceMenu(f);
      await f.whenStable();
      const chevron = button(f, CHOOSE);
      expect(deviceMenu(f)).not.toBeNull();
      expect(chevron?.getAttribute('aria-expanded')).toBe('true');
      expect(chevron?.getAttribute('aria-controls')).toBe(query(f, '.devices')?.id);
      expect(chevron?.classList.contains('mj-btn--primary')).toBe(true);
      const [microphone, camera] = selects(f);
      expect(selects(f)).toHaveLength(2);
      expect(options(microphone)).toEqual(['Built-in Microphone', 'USB Headset']);
      expect(options(camera)).toEqual(['Built-in Camera', 'Desk Camera']);
      expect(microphone.value).toBe('mic-built-in');
      expect(camera.value).toBe('cam-desk');
    });

    it('lists only the microphones, and names itself so, while the host lists no camera', () => {
      const f = withDevices({ Devices: MICROPHONES, SelectedCameraID: null });
      button(f, 'Choose microphone')?.click();
      f.detectChanges();
      expect(selects(f).map(options)).toEqual([['Built-in Microphone', 'USB Headset']]);
    });

    it('sends the picked microphone and camera up, and stays open for the next pick', () => {
      const f = withDevices();
      const picked: MediaDeviceSelection[] = [];
      f.componentInstance.DeviceSelected.subscribe((selection: MediaDeviceSelection) => picked.push(selection));
      openDeviceMenu(f);
      const [microphone, camera] = selects(f);
      microphone.value = 'mic-headset';
      microphone.dispatchEvent(new Event('change'));
      camera.value = 'cam-built-in';
      camera.dispatchEvent(new Event('change'));
      f.detectChanges();
      expect(picked).toEqual([
        { Kind: 'microphone', DeviceID: 'mic-headset' },
        { Kind: 'camera', DeviceID: 'cam-built-in' },
      ]);
      expect(deviceMenu(f)).not.toBeNull();
    });

    it('closes from its close button and from Escape, and gives focus back to the chevron', () => {
      const f = withDevices();
      openDeviceMenu(f);
      (query(f, '.devices .menu__close') as HTMLButtonElement).click();
      f.detectChanges();
      expect(deviceMenu(f)).toBeNull();
      expect(document.activeElement).toBe(button(f, CHOOSE));

      openDeviceMenu(f);
      const outside = vi.fn();
      document.addEventListener('keydown', outside);
      selects(f)[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.removeEventListener('keydown', outside);
      f.detectChanges();
      expect(deviceMenu(f)).toBeNull();
      expect(document.activeElement).toBe(button(f, CHOOSE));
      expect(button(f, CHOOSE)?.getAttribute('aria-expanded')).toBe('false');
      // Escape closed the menu and went no further, so a dialog the controls sit in stays open.
      expect(outside).not.toHaveBeenCalled();
    });

    it('closes from the chevron and from a click outside, but not from a click inside', () => {
      const f = withDevices();
      openDeviceMenu(f);
      button(f, CHOOSE)?.click();
      f.detectChanges();
      expect(deviceMenu(f)).toBeNull();

      openDeviceMenu(f);
      (query(f, '.devices .menu') as HTMLElement).click();
      button(f, 'Mute microphone')?.click();
      f.detectChanges();
      expect(deviceMenu(f)).not.toBeNull();
      document.body.click();
      f.detectChanges();
      expect(deviceMenu(f)).toBeNull();
    });

    it('closes when the Share menu opens', () => {
      const f = withDevices();
      openDeviceMenu(f);
      openShareMenu(f);
      expect(overlayQuery('mj-menu[aria-label="Share"]')).not.toBeNull();
      expect(deviceMenu(f)).toBeNull();
    });

    it('closes with nothing left to pick, and stays closed when devices come back', () => {
      const f = withDevices();
      openDeviceMenu(f);
      f.componentRef.setInput('Devices', []);
      f.detectChanges();
      expect(deviceMenu(f)).toBeNull();
      expect(button(f, CHOOSE)).toBeNull();
      f.componentRef.setInput('Devices', [...MICROPHONES, ...CAMERAS]);
      f.detectChanges();
      expect(button(f, CHOOSE)?.getAttribute('aria-expanded')).toBe('false');
      expect(deviceMenu(f)).toBeNull();
    });

    it('has no axe violations with the device menu open', async () => {
      const f = withDevices({ ShowLabels: true });
      openDeviceMenu(f);
      await ExpectNoAxeViolations(f);
    });
  });

  it('shows no labels by default', () => {
    expect(queryAll(render(), '.control__label')).toEqual([]);
  });

  it('has no axe violations', async () => {
    const f = render({ MicrophoneOn: true, CameraOn: true, ShowLabels: true });
    await ExpectNoAxeViolations(f);
  });
});
