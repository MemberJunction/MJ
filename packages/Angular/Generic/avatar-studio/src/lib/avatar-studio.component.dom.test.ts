import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import {
  AVATAR_GENERATE_IMAGE_FALLBACK_ID,
  AvatarChangeEvent,
} from './avatar-studio.types';

interface MockActionResult {
  Success: boolean;
  Message: string;
  Result: object | null;
  LogEntry: null;
  Params: Array<{ Name: string; Value: string | number | boolean | object | null; Type: string }>;
  RunParams: null;
}

const mockState = {
  runActionCalls: [] as Array<{
    actionId: string;
    params: Array<{ Name: string; Value: string | number | boolean | object | null; Type: string }>;
  }>,
  runActionQueue: [] as MockActionResult[],
  notifications: [] as Array<{ message: string; style: string }>,
};

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    LogError: vi.fn(),
    RunView: {
      FromMetadataProvider: () => ({
        RunView: vi.fn(async () => ({
          Success: true,
          Results: [{ ID: AVATAR_GENERATE_IMAGE_FALLBACK_ID }],
        })),
      }),
    },
  };
});

vi.mock('@memberjunction/graphql-dataprovider', () => ({
  GraphQLDataProvider: class {},
  GraphQLActionClient: class {
    public async RunAction(
      actionId: string,
      params?: Array<{ Name: string; Value: string | number | boolean | object | null; Type: string }>
    ): Promise<MockActionResult> {
      mockState.runActionCalls.push({ actionId, params: params ?? [] });
      return (
        mockState.runActionQueue.shift() ?? {
          Success: true,
          Message: 'OK',
          Result: [],
          LogEntry: null,
          Params: [],
          RunParams: null,
        }
      );
    }
  },
}));

vi.mock('@memberjunction/ng-notifications', () => ({
  MJNotificationService: {
    get Instance() {
      return {
        CreateSimpleNotification: vi.fn((message: string, style: string) => {
          mockState.notifications.push({ message, style });
        }),
      };
    },
  },
}));

import { MjAvatarStudioComponent } from './avatar-studio.component';
import { MjAvatarPickerTriggerComponent } from './avatar-picker-trigger.component';

async function settle(fixture: { detectChanges: () => void }): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

describe('MjAvatarStudioComponent & MjAvatarPickerTriggerComponent (DOM)', () => {
  const provider = {} as IMetadataProvider;

  beforeEach(() => {
    mockState.runActionCalls = [];
    mockState.runActionQueue = [];
    mockState.notifications = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supports AI generate, iterative refine, 10-step undo, status badge, icons + accent color, and URL upload', async () => {
    const drawImageSpy = vi.fn();
    const clearRectSpy = vi.fn();
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(
        () =>
          ({
            clearRect: clearRectSpy,
            drawImage: drawImageSpy,
          }) as Partial<CanvasRenderingContext2D> as CanvasRenderingContext2D
      );
    const toDataUrlSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockImplementation((type?: string) =>
        type === 'image/webp'
          ? `data:image/webp;base64,d2VicC1hdmF0YXIt${mockState.runActionCalls.length}`
          : 'data:image/png;base64,cG5n'
      );

    const OriginalImage = globalThis.Image;
    class MockImage {
      public naturalWidth = 512;
      public naturalHeight = 512;
      public width = 512;
      public height = 512;
      public crossOrigin: string | null = null;
      public onload: (() => void) | null = null;
      public onerror: (() => void) | null = null;
      private _src = '';
      public get src(): string {
        return this._src;
      }
      public set src(v: string) {
        this._src = v;
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', MockImage);

    try {
      const emitted: AvatarChangeEvent[] = [];
      const fixture = renderComponentFixture(MjAvatarStudioComponent, {
        inputs: {
          Provider: provider,
          SubjectName: 'Product Launch Space',
          SubjectSubtitle: 'Engineering & Design',
          ShowAccentColorPicker: true,
          ShowFullIconPicker: true,
          ShowInlineFooter: true,
          PromptBuilder: (style: string) => `Custom emblem for Product Launch in ${style} style`,
        },
      });
      fixture.componentInstance.AvatarChange.subscribe((e) => emitted.push(e));
      await settle(fixture);

      const el = fixture.nativeElement as HTMLElement;
      const comp = fixture.componentInstance;

      expect(comp.AvatarPrompt).toBe('Custom emblem for Product Launch in 3D Clay Mascot style');
      expect(el.querySelector('.mjas-pill')?.textContent?.trim()).toBe('Icon mode');

      // Generate Avatar
      mockState.runActionQueue.push({
        Success: true,
        Message: 'OK',
        Result: {
          0: {
            Name: 'Images',
            Type: 'Output',
            Value: [{ modality: 'Image', mimeType: 'image/png', data: 'Zmlyc3Q=' }],
          },
        },
        LogEntry: null,
        Params: [],
        RunParams: null,
      });

      const genBtn = el.querySelector('.mjas-generate-btn') as HTMLButtonElement;
      genBtn.click();
      await settle(fixture);

      expect(comp.ImageUrl).toBe('data:image/webp;base64,d2VicC1hdmF0YXIt1');
      expect(el.querySelector('.mjas-pill')?.textContent).toContain('128×128 WebP');
      expect(drawImageSpy).toHaveBeenCalledWith(expect.anything(), 0, 0, 512, 512, 0, 0, 128, 128);
      expect(emitted[emitted.length - 1]?.ImageUrl).toBe('data:image/webp;base64,d2VicC1hdmF0YXIt1');

      // Refine Avatar
      mockState.runActionQueue.push({
        Success: true,
        Message: 'OK',
        Result: {
          Params: [
            {
              Name: 'Images',
              Type: 'Output',
              Value: [{ modality: 'Image', mimeType: 'image/png', data: 'c2Vjb25k' }],
            },
          ],
        },
        LogEntry: null,
        Params: [],
        RunParams: null,
      });

      const refineInput = el.querySelector('#mjas-avatar-refine-input') as HTMLTextAreaElement;
      refineInput.value = 'Make background teal';
      refineInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const refineBtn = Array.from(el.querySelectorAll('.mjas-refine-box button')).find((b) =>
        b.textContent?.includes('Refine')
      ) as HTMLButtonElement;
      refineBtn.click();
      await settle(fixture);

      expect(comp.ImageUrl).toBe('data:image/webp;base64,d2VicC1hdmF0YXIt2');
      expect(mockState.runActionCalls[1].params.find((p) => p.Name === 'SourceImage')?.Value).toBe(
        'Zmlyc3Q='
      );
      expect(comp.HistoryCount).toBe(2);

      // Undo restores first generated WebP
      comp.Undo();
      fixture.detectChanges();
      expect(comp.ImageUrl).toBe('data:image/webp;base64,d2VicC1hdmF0YXIt1');

      // Switch to Icons tab: select curated tile + accent color swatch
      const tabs = Array.from(el.querySelectorAll('.mjas-tab')) as HTMLButtonElement[];
      tabs[1].click();
      fixture.detectChanges();

      expect(el.querySelector('mj-icon-picker')).not.toBeNull();
      const rocketTile = Array.from(el.querySelectorAll('.mjas-icon-tile')).find((b) =>
        b.textContent?.includes('Rocket')
      ) as HTMLButtonElement;
      rocketTile.click();
      fixture.detectChanges();
      expect(comp.IconClass).toBe('fa-solid fa-rocket');
      expect(comp.ImageUrl).toBe('');

      const tealSwatch = Array.from(el.querySelectorAll('.mjas-swatch')).find(
        (b) => b.getAttribute('aria-label') === 'Teal'
      ) as HTMLButtonElement;
      tealSwatch.click();
      fixture.detectChanges();
      expect(comp.AccentColor).toBe('#0D9488');

      // Switch to Upload / URL tab and set custom URL
      tabs[2].click();
      fixture.detectChanges();
      const urlInput = el.querySelector('#mjas-logo-url') as HTMLInputElement;
      urlInput.value = 'https://cdn.example.com/custom.png';
      urlInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(comp.ImageUrl).toBe('https://cdn.example.com/custom.png');
      expect(el.querySelector('.mjas-pill')?.textContent?.trim()).toBe('Custom URL');
    } finally {
      getContextSpy.mockRestore();
      toDataUrlSpy.mockRestore();
      vi.stubGlobal('Image', OriginalImage);
    }
  });

  it('renders MjAvatarPickerTriggerComponent with icon fallback, image preview, and click emission', async () => {
    const clicks: number[] = [];
    const fixture = renderComponentFixture(MjAvatarPickerTriggerComponent, {
      inputs: {
        IconClass: 'fa-solid fa-rocket',
        AccentColor: '#0D9488',
        AltText: 'Launch Space',
        Size: 64,
      },
    });
    fixture.componentInstance.TriggerClick.subscribe(() => clicks.push(1));
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('.mjas-trigger') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(el.querySelector('i.fa-rocket')).not.toBeNull();
    expect(el.querySelector('img')).toBeNull();

    btn.click();
    expect(clicks).toHaveLength(1);

    fixture.componentInstance.ImageUrl = 'data:image/webp;base64,YWJj';
    fixture.detectChanges();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('data:image/webp;base64,YWJj');
  });
});
