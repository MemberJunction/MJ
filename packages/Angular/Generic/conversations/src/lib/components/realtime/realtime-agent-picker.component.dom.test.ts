import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import {
    RenderComponentFixture,
    CreateFakeProvider,
    Query,
    Text,
    Capture,
    OverlayQuery,
    OverlayQueryAll,
    ClearOverlayContainers,
} from '@memberjunction/ng-test-utils';

/**
 * DOM spec for <mj-realtime-agent-picker>'s voice list: for holders of `Realtime: Advanced Session Controls` it is an
 * mj-dropdown with one option per persona, whose options mark the voices that come with an avatar (a camera icon) and
 * show a persona's preview image; picking such a voice also picks its avatar, and a hint under the list says so. Two
 * personas can share a voice id (here Robin, and Avery: Robin's voice with a face). The voice data, the model cache and
 * the authorization check are faked.
 */
const h = vi.hoisted(() => ({
    authorized: true,
    engine: {
        Config: async () => undefined,
        Models: [
            { ID: 'model-a', Name: 'Live Voice Model', AIModelType: 'Realtime', IsActive: true },
            { ID: 'model-b', Name: 'Fast Voice Model', AIModelType: 'Realtime', IsActive: true },
        ],
    },
    voices: [
        {
            ModelID: 'model-a',
            ModelName: 'Live Voice Model',
            Voices: [
                { ID: 'voice-robin', Name: 'Avery', PersonaID: 'p-avery', AvatarID: 'Avery', PreviewImageURL: 'https://img.example.test/avery.png' },
                { ID: 'voice-robin', Name: 'Robin', PersonaID: 'p-robin', AvatarID: null, PreviewImageURL: null },
                { ID: 'voice-jordan', Name: 'Jordan', PersonaID: 'p-jordan', AvatarID: null, PreviewImageURL: 'https://img.example.test/jordan.png' },
                { ID: 'voice-riley', Name: 'Riley' },
            ],
        },
        {
            ModelID: 'model-b',
            ModelName: 'Fast Voice Model',
            Voices: [{ ID: 'voice-sky', Name: 'Sky', PersonaID: 'p-sky', AvatarID: 'Sky', PreviewImageURL: null }],
        },
    ],
}));

vi.mock('@memberjunction/ai-engine-base', () => ({ AIEngineBase: { GetProviderInstance: () => h.engine } }));
vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: class {},
    GraphQLLiveKitClient: class {
        public async GetRealtimeModelVoices() {
            return h.voices;
        }
    },
}));
vi.mock('../../services/user-authorization', () => ({
    REALTIME_ADVANCED_SESSION_CONTROLS: 'Realtime: Advanced Session Controls',
    UserHoldsAuthorization: () => h.authorized,
}));

import { RealtimeAgentPickerComponent, type RealtimeAgentPick } from './realtime-agent-picker.component';

const AGENTS = [
    { ID: 'agent-1', Name: 'Research Assistant', IconClass: 'fa-solid fa-magnifying-glass', Description: 'Finds sources' },
    { ID: 'agent-2', Name: 'Writing Coach', IconClass: 'fa-solid fa-pen-nib', Description: 'Edits drafts' },
];

/** Lets the picker's async authorization check and voice loads finish. */
const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
};

async function renderPicker(modelId: string | null = 'model-a'): Promise<ComponentFixture<RealtimeAgentPickerComponent>> {
    const f = RenderComponentFixture(RealtimeAgentPickerComponent, {
        inputs: { Provider: CreateFakeProvider({ currentUser: { ID: 'user-1', Name: 'Test User' } }), Agents: AGENTS, DefaultAgentId: 'agent-1' },
    });
    await settle();
    if (modelId) {
        f.componentInstance.OnModelChange(modelId);
    }
    await redraw(f);
    return f;
}

async function redraw(f: ComponentFixture<RealtimeAgentPickerComponent>): Promise<void> {
    f.detectChanges();
    await f.whenStable();
    await settle(); // ngModel writes the dropdown's value in a microtask
    f.detectChanges();
}

function openVoiceList(f: ComponentFixture<RealtimeAgentPickerComponent>): void {
    (Query(f, '.mj-voice-picker__voice-row .mj-dropdown') as HTMLElement).click();
    f.detectChanges();
}

function closeVoiceList(f: ComponentFixture<RealtimeAgentPickerComponent>): void {
    (OverlayQuery('.mj-dropdown-backdrop') as HTMLElement).click();
    f.detectChanges();
}

/** The open voice list's option whose text contains `name` ("Default" is the first). */
function voiceOption(name: string): HTMLElement {
    const option = OverlayQueryAll('.mj-dropdown-option').find((o) => o.textContent?.includes(name));
    if (!option) {
        throw new Error(`no voice option "${name}"`);
    }
    return option as HTMLElement;
}

/** The names of the open voice list's options marked selected. */
function selectedOptions(): string[] {
    return OverlayQueryAll('.mj-dropdown-option[aria-selected="true"]')
        .map((o) => o.querySelector('.mj-voice-picker__voice-name')?.textContent ?? o.textContent?.trim() ?? '');
}

async function pickVoice(f: ComponentFixture<RealtimeAgentPickerComponent>, name: string): Promise<void> {
    openVoiceList(f);
    voiceOption(name).click();
    await redraw(f);
}

function startCall(f: ComponentFixture<RealtimeAgentPickerComponent>): RealtimeAgentPick {
    const picks = Capture(f.componentInstance.AgentPicked);
    f.componentInstance.StartCall();
    expect(picks).toHaveLength(1);
    return picks[0];
}

function hintLine(f: ComponentFixture<RealtimeAgentPickerComponent>): Element | null {
    return Query(f, '#mjRealtimeVoiceHint .mj-voice-picker__voice-hint-line');
}

beforeEach(() => {
    h.authorized = true;
});
// CDK reuses one overlay container per file; a list left open would leak into the next test.
afterEach(() => ClearOverlayContainers());

describe('RealtimeAgentPickerComponent voice list (DOM)', () => {
    it('shows no voice model or voice list to users without the authorization', async () => {
        h.authorized = false;
        const f = await renderPicker(null);
        expect(Query(f, '#mjRealtimeModelSelect')).toBeNull();
        expect(Query(f, 'mj-dropdown')).toBeNull();
    });

    it('lists one option per persona in an mj-dropdown named by its visible label', async () => {
        const f = await renderPicker();
        const trigger = Query(f, '.mj-voice-picker__voice-row .mj-dropdown') as HTMLElement;
        expect(trigger.getAttribute('aria-labelledby')).toBe('mjRealtimeVoiceLabel');
        expect(Text(f, '#mjRealtimeVoiceLabel')).toBe('Voice');
        expect(Text(f, '.mj-voice-picker__voice-row .mj-dropdown-value')).toBe('Default');
        openVoiceList(f);
        expect(OverlayQueryAll('.mj-dropdown-option').map((o) => o.querySelector('.mj-voice-picker__voice-name')?.textContent ?? o.textContent?.trim()))
            .toEqual(['Default', 'Avery', 'Robin', 'Jordan', 'Riley']);
    });

    it('marks only the voices that come with an avatar', async () => {
        const f = await renderPicker();
        openVoiceList(f);
        expect(voiceOption('Avery').querySelector('.mj-voice-picker__voice-avatar .fa-video')).not.toBeNull();
        expect(voiceOption('Avery').textContent).toContain('Comes with an avatar');
        for (const name of ['Robin', 'Jordan', 'Riley']) {
            expect(voiceOption(name).querySelector('.mj-voice-picker__voice-avatar')).toBeNull();
        }
        expect(OverlayQueryAll('.mj-voice-picker__voice-avatar')).toHaveLength(1);
    });

    it("shows a persona's preview image when it has one, avatar or not", async () => {
        const f = await renderPicker();
        openVoiceList(f);
        expect(voiceOption('Avery').querySelector('img')?.getAttribute('src')).toBe('https://img.example.test/avery.png');
        expect(voiceOption('Jordan').querySelector('img')?.getAttribute('src')).toBe('https://img.example.test/jordan.png');
        expect(voiceOption('Robin').querySelector('img')).toBeNull();
        expect(voiceOption('Riley').querySelector('img')).toBeNull();
    });

    it('hides a preview image that fails to load', async () => {
        const f = await renderPicker();
        openVoiceList(f);
        voiceOption('Jordan').querySelector('img')?.dispatchEvent(new Event('error'));
        f.detectChanges();
        expect(voiceOption('Jordan').querySelector('img')).toBeNull();
        expect(voiceOption('Avery').querySelector('img')).not.toBeNull();
    });

    it('a pick of a voice with an avatar sends the voice and the avatar', async () => {
        const f = await renderPicker();
        await pickVoice(f, 'Avery');
        expect(Text(f, '.mj-voice-picker__voice-row .mj-dropdown-value')).toBe('Avery');
        expect(startCall(f)).toMatchObject({ PreferredModelId: 'model-a', PreferredVoice: 'voice-robin', PreferredAvatarId: 'Avery' });
    });

    it('a pick of a voice without an avatar sends the voice alone', async () => {
        const f = await renderPicker();
        await pickVoice(f, 'Jordan');
        expect(startCall(f)).toMatchObject({ PreferredVoice: 'voice-jordan', PreferredAvatarId: null });
    });

    it('keeps two personas that share a voice apart: each is its own option, and only the picked one has the face', async () => {
        const f = await renderPicker();
        await pickVoice(f, 'Robin');
        expect(Text(f, '.mj-voice-picker__voice-row .mj-dropdown-value')).toBe('Robin');
        openVoiceList(f);
        expect(selectedOptions()).toEqual(['Robin']);
        closeVoiceList(f);
        expect(startCall(f)).toMatchObject({ PreferredVoice: 'voice-robin', PreferredAvatarId: null });

        await pickVoice(f, 'Avery');
        openVoiceList(f);
        expect(selectedOptions()).toEqual(['Avery']);
        closeVoiceList(f);
        expect(startCall(f)).toMatchObject({ PreferredVoice: 'voice-robin', PreferredAvatarId: 'Avery' });
    });

    it('says under the voice list when the picked voice comes with an avatar, for sighted and screen-reader users', async () => {
        const f = await renderPicker();
        const hint = Query(f, '#mjRealtimeVoiceHint') as HTMLElement;
        expect(hint.getAttribute('aria-live')).toBe('polite');
        expect((Query(f, '.mj-voice-picker__voice-row .mj-dropdown') as HTMLElement).getAttribute('aria-describedby')).toBe('mjRealtimeVoiceHint');
        expect(hintLine(f)).toBeNull();

        await pickVoice(f, 'Avery');
        expect(hintLine(f)?.textContent?.trim()).toBe('Comes with an avatar');
        expect(hintLine(f)?.querySelector('.fa-video')?.getAttribute('aria-hidden')).toBe('true');

        await pickVoice(f, 'Robin');
        expect(hintLine(f)).toBeNull();
    });

    it('"Default" sends neither a voice nor an avatar', async () => {
        const f = await renderPicker();
        await pickVoice(f, 'Avery');
        await pickVoice(f, 'Default');
        expect(hintLine(f)).toBeNull();
        expect(startCall(f)).toMatchObject({ PreferredVoice: null, PreferredAvatarId: null });
    });

    it('a model switch clears the voice, its avatar and the hint', async () => {
        const f = await renderPicker();
        await pickVoice(f, 'Avery');
        f.componentInstance.OnModelChange('model-b');
        await redraw(f);
        expect(Text(f, '.mj-voice-picker__voice-row .mj-dropdown-value')).toBe('Default');
        expect(hintLine(f)).toBeNull();
        expect(startCall(f)).toMatchObject({ PreferredModelId: 'model-b', PreferredVoice: null, PreferredAvatarId: null });
    });

    it('never sends a voice or an avatar for a user without the authorization', async () => {
        h.authorized = false;
        const f = await renderPicker(null);
        f.componentInstance.SelectedModelId = 'model-a';
        f.componentInstance.SelectedVoice = h.voices[0].Voices[0];
        expect(startCall(f)).toMatchObject({ PreferredModelId: null, PreferredVoice: null, PreferredAvatarId: null });
    });

    it('a click on the backdrop of the open voice list closes the list, not the picker', async () => {
        const f = await renderPicker();
        const cancels = Capture(f.componentInstance.Cancelled);
        openVoiceList(f);
        (OverlayQuery('.mj-dropdown-backdrop') as HTMLElement).click();
        f.detectChanges();
        expect(OverlayQuery('.mj-dropdown-panel')).toBeNull();
        expect(cancels).toHaveLength(0);
        // A click anywhere else outside the picker still dismisses it.
        document.body.click();
        expect(cancels).toHaveLength(1);
    });
});
