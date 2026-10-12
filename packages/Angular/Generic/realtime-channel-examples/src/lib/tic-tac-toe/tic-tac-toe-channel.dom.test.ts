import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import type { RealtimeChannelContext, RealtimeChannelEvent, RealtimeChannelOutput, RealtimeContextActionResult } from '@memberjunction/realtime-runtime';
import { BaseRealtimeChannelClient, BuildChannelCatalogNote, ChannelActionDispatcher } from '@memberjunction/realtime-runtime';
import { ChannelFrameCapture } from '@memberjunction/ng-realtime-channels';
import { MJGlobal } from '@memberjunction/global';
import { LoadExampleTicTacToeChannel, TicTacToeChannel } from './tic-tac-toe-channel';
import { TicTacToeBoardComponent } from './tic-tac-toe-board.component';
import { FindResult } from './tic-tac-toe-engine';

/** The connection the channel talks through: it records the notes the model is sent and the frames it is shown. */
class FakeModelConnection {
    public Notes: string[] = [];
    public Frames: string[] = [];
    public readonly EstablishedTracks = [{ Descriptor: { Modality: 'video', Direction: 'inbound', Rate: 4 } }];
    public readonly MaxInboundVideoStreams = 1;
    public IsTrackEstablished(modality: string, direction: string): boolean {
        return modality === 'video' && direction === 'inbound';
    }
    public SendVideoFrame(data: string): boolean {
        this.Frames.push(data);
        return true;
    }
    public SendContextNote(text: string): void {
        this.Notes.push(text);
    }
}

/** A whole call in miniature: the real board, the real channel, the real dispatcher the agent's tool calls go through. */
function startCall() {
    const connection = new FakeModelConnection();
    const channel = new TicTacToeChannel();
    const context = {
        AgentName: 'Sage',
        Provider: null,
        SendContextNote: (text: string) => connection.Notes.push(text),
        RequestSave: () => undefined,
        SetFocusMode: () => undefined,
        SaveAsArtifact: async () => null,
        AgentSessionID: null,
        ExecuteServerAction: async () => null,
        ChannelConfig: {},
        Client: connection as unknown as RealtimeChannelContext['Client'],
    } as RealtimeChannelContext;
    channel.Initialize(context);
    const events: RealtimeChannelEvent[] = [];
    channel.Events$.subscribe((e) => events.push(e));
    const outputs: RealtimeChannelOutput[] = [];
    channel.Output$.subscribe((o) => outputs.push(o));
    const dispatcher = new ChannelActionDispatcher({
        FindChannel: (key) => (key.toLowerCase() === 'tictactoe' ? { Plugin: channel, IsOpen: true } : null),
        ListChannelKeys: () => ['TicTacToe'],
        ActivateChannel: async () => undefined,
    });
    /** What the agent does: one `ContextTool` call addressed at the channel. */
    const agent = (action: string, params: Record<string, string | number> = {}): Promise<RealtimeContextActionResult> =>
        dispatcher.Dispatch({ Target: { Channel: 'TicTacToe' }, Action: action, Params: params });
    return { channel, connection, events, outputs, agent };
}

/** The panel appears: the overlay creates the board and hands it to the channel. */
function showBoard(channel: TicTacToeChannel): ComponentFixture<TicTacToeBoardComponent> {
    const fixture = renderComponentFixture(TicTacToeBoardComponent, {});
    channel.BindSurface(fixture.componentInstance);
    return fixture;
}

/** What the user does: click a cell. */
async function userClicks(fixture: ComponentFixture<TicTacToeBoardComponent>, cell: number): Promise<void> {
    const button = fixture.nativeElement.querySelector(`[data-cell="${cell}"]`) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
}

const rows = (fixture: ComponentFixture<TicTacToeBoardComponent>): string[] => {
    const cells = fixture.componentInstance.Board().map((c) => c ?? '.');
    return [cells.slice(0, 3).join(''), cells.slice(3, 6).join(''), cells.slice(6, 9).join('')];
};

describe('TicTacToeChannel: a whole game, played by a user clicking and an agent calling verbs (DOM)', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
        ChannelFrameCapture.Instance.Register(null);
        vi.restoreAllMocks();
    });

    it('opens, tells the model the board, and plays to a user win with interleaved moves and refusals along the way', async () => {
        const { channel, connection, events, outputs, agent } = startCall();
        const fixture = showBoard(channel);

        const opened = await agent('open', {});
        expect(opened).toMatchObject({ Success: true });
        expect(connection.Notes.find((n) => n.includes('opened'))).toContain('...'); // the empty board, as rows

        // The agent tries to move before it is its turn: refused, with a reason it can act on, and nothing changes.
        expect(await agent('play', { cell: 0 })).toMatchObject({ Success: false, ErrorCode: 'verb_failed', ErrorMessage: expect.stringContaining('It is not your turn') });
        expect(rows(fixture)).toEqual(['...', '...', '...']);

        await userClicks(fixture, 4); // X centre
        expect(rows(fixture)).toEqual(['...', '.X.', '...']);
        expect(await agent('play', { cell: 4 })).toMatchObject({ Success: false, ErrorCode: 'verb_failed', ErrorMessage: expect.stringContaining('That cell is taken') });
        expect(await agent('play', { cell: 0 })).toMatchObject({ Success: true, Result: { placed: 0 } }); // O top-left
        await userClicks(fixture, 2); // X top-right
        expect(await agent('play', { cell: 1 })).toMatchObject({ Success: true }); // O top-middle (does not block 6)
        expect(rows(fixture)).toEqual(['OOX', '.X.', '...']);

        // A click on a taken cell does nothing (the button is disabled), and the game is still on.
        await userClicks(fixture, 0);
        expect(fixture.componentInstance.Result()).toBeNull();

        await userClicks(fixture, 6); // X bottom-left: 2, 4, 6 is a line
        expect(rows(fixture)).toEqual(['OOX', '.X.', 'X..']);
        expect(FindResult(fixture.componentInstance.Board())).toBe('X');

        // Everything that happened is on the channel's record: moves attributed to who made them, then the end.
        const moves = events.filter((e) => e.Name === 'moved').map((e) => ({ cell: e.Payload['cell'], by: e.Payload['by'] }));
        expect(moves).toEqual([
            { cell: 4, by: 'user' },
            { cell: 0, by: 'agent' },
            { cell: 2, by: 'user' },
            { cell: 1, by: 'agent' },
            { cell: 6, by: 'user' },
        ]);
        expect(events.filter((e) => e.Name === 'game_over')).toHaveLength(1);
        expect(outputs).toHaveLength(1);
        expect(outputs[0].Output).toEqual({ winner: 'user', moves: 5 });

        // The model heard about it: a note says the game completed, and the board it was told matches the board on screen.
        await vi.waitFor(() => expect(connection.Notes.some((n) => n.includes('completed'))).toBe(true));
        expect(connection.Notes.find((n) => n.includes('completed'))).toContain('"winner":"user"');

        // After the end, a play is refused with the way forward.
        expect(await agent('play', { cell: 8 })).toMatchObject({ Success: false, ErrorCode: 'verb_failed', ErrorMessage: expect.stringContaining('The game is over') });
        expect(await agent('new_game', { first: 'agent' })).toMatchObject({ Success: true });
        expect(rows(fixture)).toEqual(['...', '...', '...']);
        expect(fixture.componentInstance.Turn()).toBe('O');
    });

    it('opens with the agent first and plays to an agent win', async () => {
        const { channel, outputs, agent } = startCall();
        const fixture = showBoard(channel);
        expect(await agent('open', { first: 'agent' })).toMatchObject({ Success: true });
        await vi.waitFor(() => expect(fixture.componentInstance.Turn()).toBe('O'));

        expect(await agent('play', { cell: 4 })).toMatchObject({ Success: true });
        await userClicks(fixture, 0);
        expect(await agent('play', { cell: 2 })).toMatchObject({ Success: true });
        await userClicks(fixture, 1);
        expect(await agent('play', { cell: 6 })).toMatchObject({ Success: true });
        expect(rows(fixture)).toEqual(['XXO', '.O.', 'O..']);
        expect(outputs[0].Output).toEqual({ winner: 'agent', moves: 5 });
        await fixture.whenStable();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('O wins');
    });

    it('a game that nobody wins is a draw', async () => {
        const { channel, outputs, agent } = startCall();
        const fixture = showBoard(channel);
        await agent('open', {});
        // X O X / X O O / O X X
        const script: Array<['user' | 'agent', number]> = [
            ['user', 0], ['agent', 1], ['user', 2], ['agent', 4], ['user', 3], ['agent', 5], ['user', 7], ['agent', 6], ['user', 8],
        ];
        for (const [who, cell] of script) {
            if (who === 'user') {
                await userClicks(fixture, cell);
            } else {
                expect(await agent('play', { cell })).toMatchObject({ Success: true });
            }
        }
        expect(rows(fixture)).toEqual(['XOX', 'XOO', 'OXX']);
        expect(outputs[0].Output).toEqual({ winner: 'draw', moves: 9 });
    });

    it('rejects a call the descriptor does not allow before the board sees it', async () => {
        const { channel, agent } = startCall();
        const fixture = showBoard(channel);
        await agent('open', {});
        const spy = vi.spyOn(fixture.componentInstance, 'Play');
        expect(await agent('play', { cell: 12 })).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
        expect(await agent('play', {})).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
        expect(await agent('resign')).toMatchObject({ Success: false, ErrorCode: 'unknown_verb' });
        expect(spy).not.toHaveBeenCalled();
    });

    it('survives the panel being collapsed and expanded: the next board is put back as it was', async () => {
        const { channel, agent } = startCall();
        const first = showBoard(channel);
        await agent('open', {});
        await userClicks(first, 4);
        await agent('play', { cell: 0 });
        channel.UnbindSurface();
        first.destroy();

        const second = showBoard(channel);
        expect(rows(second)).toEqual(['O..', '.X.', '...']);
        expect(second.componentInstance.Turn()).toBe('X');
        await userClicks(second, 8);
        expect(rows(second)).toEqual(['O..', '.X.', '..X']);
    });

    it('a move made while no board is on screen waits for it, then happens', async () => {
        const { channel, agent } = startCall();
        await agent('open', { first: 'agent' });
        const pending = agent('play', { cell: 4 });
        const fixture = showBoard(channel);
        expect(await pending).toMatchObject({ Success: true });
        expect(rows(fixture)).toEqual(['...', '.O.', '...']);
    });

    it('resumes from the saved state of record', async () => {
        const { channel, agent } = startCall();
        const fixture = showBoard(channel);
        await agent('open', {});
        await userClicks(fixture, 4);
        const saved = channel.SerializeState();

        const resumed = startCall();
        expect(resumed.channel.RestoreState(saved ?? '')).toBe(true);
        const fresh = showBoard(resumed.channel);
        expect(rows(fresh)).toEqual(['...', '.X.', '...']);
        expect(fresh.componentInstance.Turn()).toBe('O');
        expect(await resumed.agent('play', { cell: 0 })).toMatchObject({ Success: true });
    });
});

describe('TicTacToeChannel: exposure policy', () => {
    it("at 'none' the agent can still play, but read_board is refused whole and the catalog says why; at 'state' it works", async () => {
        const { channel, agent } = startCall();
        showBoard(channel);
        await agent('open', {});
        channel.ApplyExposure({ Policy: 'none', Reasons: ['the user chose to share nothing'] });
        await vi.waitFor(() => expect(channel.Exposure).toBe('none'));

        expect(await agent('read_board')).toMatchObject({ Success: false, ErrorCode: 'exposure_restricted' });
        expect((await agent('play', { cell: 0 })).ErrorMessage).toContain('It is not your turn'); // it ran: the rules answered, not the policy
        const catalog = BuildChannelCatalogNote([
            {
                Descriptor: channel.GetDescriptor(),
                IsOpen: true,
                HasNativeTools: false,
                ExposureLimit: { Effective: channel.Exposure, Ceiling: channel.GetDescriptor().MaxExposure, Reasons: [...channel.ExposureReasons] },
            },
        ]);
        expect(catalog).toContain('read_board');
        expect(catalog).toContain('unavailable right now');

        channel.ApplyExposure({ Policy: 'state' });
        expect(await agent('read_board')).toMatchObject({ Success: true, Result: { state: { board: ['...', '...', '...'], turn: 'X', result: 'none', moves: 0 } } });
    });
});

describe('TicTacToeChannel: showing the model the board', () => {
    afterEach(() => ChannelFrameCapture.Instance.Register(null));

    it('with a rasterizer registered, and only while pixels are allowed, the user\'s move reaches the model as a frame of the board', async () => {
        const rasterized: HTMLElement[] = [];
        ChannelFrameCapture.Instance.Register(async (element) => {
            rasterized.push(element);
            return 'BOARDJPEG';
        });
        const { channel, connection, agent } = startCall();
        const fixture = showBoard(channel);
        await agent('open', {});
        channel.ApplyExposure({ Policy: 'pixels' });

        await userClicks(fixture, 4);
        await vi.waitFor(() => expect(connection.Frames.length).toBeGreaterThan(0));
        expect(connection.Frames[0]).toBe('BOARDJPEG');
        expect(rasterized[0]).toBe(fixture.componentInstance.Element);

        const before = connection.Frames.length;
        channel.ApplyExposure({ Policy: 'pixels', User: 'state' });
        await agent('play', { cell: 0 });
        await new Promise((r) => setTimeout(r, 40));
        expect(connection.Frames.length).toBe(before);
    });

    it('with no rasterizer the channel offers state only', () => {
        const { channel } = startCall();
        expect(channel.GetSourcedTracks()).toEqual([]);
    });
});

describe('TicTacToeChannel: registration', () => {
    it('is registered under its ClassFactory key once the Load function has been called', () => {
        LoadExampleTicTacToeChannel();
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(BaseRealtimeChannelClient, 'ExampleTicTacToeChannel');
        expect(instance).toBeInstanceOf(TicTacToeChannel);
        expect(instance?.ChannelName).toBe('TicTacToe');
    });
});
