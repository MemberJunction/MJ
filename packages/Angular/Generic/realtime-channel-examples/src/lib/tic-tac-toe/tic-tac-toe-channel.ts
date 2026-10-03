/**
 * @fileoverview A realtime channel for tic-tac-toe, built ONLY by wrapping {@link TicTacToeBoardComponent} with
 * {@link AngularComponentChannel}. This file is the walkthrough referenced by `guides/REALTIME_CHANNELS_GUIDE.md`
 * ("Wrapping an existing component"): everything in it is one of the seven things the adapter asks for.
 *
 * 1. {@link TicTacToeChannel.ComponentClass}: the existing component.
 * 2. {@link TicTacToeChannel.Descriptor}: what the agent is told (the only thing it has to go on).
 * 3. {@link TicTacToeChannel.ReadSurfaceState}: the board as the model should perceive it.
 * 4. {@link TicTacToeChannel.ApplySurfaceVerb}: what each verb does to the component.
 * 5. {@link TicTacToeChannel.SurfaceEvents}: which outputs of the component are events.
 * 6. Optional: {@link TicTacToeChannel.OnSurfaceOpen}, {@link TicTacToeChannel.SurfaceCompletion},
 *    {@link TicTacToeChannel.OnSurfaceBound}, {@link TicTacToeChannel.SurfaceElement}.
 *
 * The user plays `X` and the agent plays `O`. Both act on the same board: the user by clicking, the agent by the `play`
 * verb, and every rule (whose turn, is the cell free) lives in the component, so there is one place a move can be refused.
 *
 * This channel is NOT loaded by default. To use it, import this package, call {@link LoadExampleTicTacToeChannel}
 * (it keeps the `@RegisterClass` registration from being tree-shaken) and bring it to a session: as a host channel
 * (`HostChannels: [{ ClientPluginClass: 'ExampleTicTacToeChannel' }]`) or through an `MJ: AI Agent Channels` row.
 *
 * @module @memberjunction/ng-realtime-channel-examples
 */

import type { Type } from '@angular/core';
import { outputToObservable } from '@angular/core/rxjs-interop';
import { map, merge, type Observable } from 'rxjs';
import type { JSONObject } from '@memberjunction/ai';
import type { RealtimeChannelActor, RealtimeChannelDescriptor } from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeChannelClient, type RealtimeChannelVerbResult } from '@memberjunction/realtime-runtime';
import { AngularComponentChannel, type ChannelSurfaceEvent } from '@memberjunction/ng-realtime-channels';
import { TicTacToeBoardComponent, type TicTacToeRefusal } from './tic-tac-toe-board.component';
import { OtherMark, type TicTacToeCell, type TicTacToeMark } from './tic-tac-toe-engine';

/** The mark the agent plays. The person at the keyboard plays the other. */
const AGENT_MARK: TicTacToeMark = 'O';
const USER_MARK: TicTacToeMark = OtherMark(AGENT_MARK);

/** What the model is told. Written FOR the model: it is all it has to go on. */
const DESCRIPTOR: RealtimeChannelDescriptor = {
    Key: 'TicTacToe',
    Version: '1.0.0',
    DisplayName: 'Tic-tac-toe',
    Instructions:
        'A tic-tac-toe board you share with the user. The user plays X by clicking; you play O with the play action. ' +
        'Cells are numbered 0 to 8, left to right and top to bottom (0 is the top left, 4 the centre, 8 the bottom right). ' +
        'The board in your state shows three rows of three characters: X, O, or . for an empty cell. ' +
        'When the user moves you are told, and if it is your turn you should reply with one play. ' +
        'Only play when state.turn is O: if it is X, the user is thinking, so wait. If a play is refused, read the reason and try again or ask. ' +
        'Say your move out loud briefly ("I will take the centre"), and congratulate or console when the game ends.',
    Nouns: [
        { Name: 'board', Description: 'Three rows of three characters: X, O, or . for empty.', Schema: { type: 'array', items: { type: 'string' } } },
        { Name: 'turn', Description: 'Whose turn it is: X (the user), O (you), or none when the game is over.', Schema: { type: 'string', enum: ['X', 'O', 'none'] } },
        { Name: 'result', Description: 'How the game ended: X, O, draw, or none while it is on.', Schema: { type: 'string', enum: ['X', 'O', 'draw', 'none'] } },
        { Name: 'moves', Description: 'How many marks are on the board.', Schema: { type: 'integer' } },
    ],
    Verbs: [
        {
            Name: 'play',
            Description: 'Place your O on an empty cell.',
            ParametersSchema: { type: 'object', properties: { cell: { type: 'integer', minimum: 0, maximum: 8 } }, required: ['cell'], additionalProperties: false },
            InvokableBy: 'both',
            Preconditions: ['It is your turn (state.turn is O).', 'The cell is empty.', 'The game is not over.'],
        },
        {
            Name: 'new_game',
            Description: 'Clear the board and start again. Say who plays first.',
            ParametersSchema: { type: 'object', properties: { first: { type: 'string', enum: ['user', 'agent'] } }, additionalProperties: false },
            InvokableBy: 'both',
        },
        {
            // Returns the board contents as DATA, so it needs at least state exposure: with none, it is refused whole.
            Name: 'read_board',
            Description: 'Read the board and whose turn it is, when you need to check rather than rely on the last note.',
            ParametersSchema: { type: 'object', properties: {}, additionalProperties: false },
            InvokableBy: 'agent',
            ReturnsChannelData: 'state',
        },
    ],
    Inputs: { type: 'object', properties: { first: { type: 'string', enum: ['user', 'agent'] } }, additionalProperties: false },
    Events: [
        { Name: 'moved', Description: 'A mark was placed (by the user or by you).', PayloadSchema: { type: 'object', properties: { cell: { type: 'integer' }, mark: { type: 'string' }, by: { type: 'string', enum: ['user', 'agent'] } } } },
        { Name: 'game_over', Description: 'The game ended.', PayloadSchema: { type: 'object', properties: { result: { type: 'string' } } } },
    ],
    Output: {
        type: 'object',
        properties: { winner: { type: 'string', enum: ['user', 'agent', 'draw'] }, moves: { type: 'integer' } },
        required: ['winner', 'moves'],
    },
    DisplayPolicy: 'on-demand',
    DefaultAvailability: 'opt-in',
    MaxExposure: 'pixels',
};

/** The refusal reasons, as sentences the model can act on. */
const REFUSALS: Record<TicTacToeRefusal, string> = {
    game_over: 'The game is over. Use new_game to play again.',
    not_your_turn: 'It is not your turn. Wait for the user to move.',
    occupied: 'That cell is taken. Choose an empty cell.',
    out_of_range: 'Cells are numbered 0 to 8.',
};

/** The three rows of a board as the model reads them. */
function boardRows(board: readonly TicTacToeCell[]): string[] {
    const chars = board.map((cell) => cell ?? '.');
    return [0, 3, 6].map((start) => chars.slice(start, start + 3).join(''));
}

/** The board back from the rows the model reads (a restored session). `null` when the rows are not a board. */
function boardFromRows(rows: unknown): TicTacToeCell[] | null {
    if (!Array.isArray(rows) || rows.length !== 3 || !rows.every((r) => typeof r === 'string' && r.length === 3)) {
        return null;
    }
    return (rows as string[]).join('').split('').map((ch): TicTacToeCell => (ch === 'X' || ch === 'O' ? ch : null));
}

/**
 * Tic-tac-toe as a realtime channel. See the file comment for the walkthrough.
 */
@RegisterClass(BaseRealtimeChannelClient, 'ExampleTicTacToeChannel')
export class TicTacToeChannel extends AngularComponentChannel<TicTacToeBoardComponent> {
    protected readonly ComponentClass: Type<TicTacToeBoardComponent> = TicTacToeBoardComponent;
    protected readonly Descriptor: RealtimeChannelDescriptor = DESCRIPTOR;

    /** The board as the model perceives it: one entry per noun in the descriptor. */
    protected ReadSurfaceState(board: TicTacToeBoardComponent): JSONObject {
        return {
            board: boardRows(board.Board()),
            turn: board.Turn() ?? 'none',
            result: board.Result() ?? 'none',
            moves: board.MoveCount(),
        };
    }

    /** What each verb does to the component. Parameters are already validated against the descriptor's schema. */
    protected ApplySurfaceVerb(board: TicTacToeBoardComponent, verb: string, args: JSONObject, actor: RealtimeChannelActor): RealtimeChannelVerbResult {
        switch (verb) {
            case 'play': {
                const outcome = board.Play(actor === 'agent' ? AGENT_MARK : USER_MARK, args['cell'] as number);
                // The result says only what was done. The board's contents reach the model through perception notes (gated by
                // exposure) or read_board (refused whole below 'state'); a verb that returned the board here would hand it to
                // a model that is not allowed to see it.
                return outcome.Ok
                    ? { Success: true, Result: { placed: args['cell'] as number } }
                    : { Success: false, ErrorCode: outcome.Reason, Error: REFUSALS[outcome.Reason] };
            }
            case 'new_game':
                board.NewGame(args['first'] === 'agent' ? AGENT_MARK : USER_MARK);
                return { Success: true, Result: { started: true } };
            case 'read_board':
                return { Success: true, Result: { state: this.ReadSurfaceState(board) } };
            default:
                return { Success: false, ErrorCode: 'unknown_verb', Error: `The tic-tac-toe channel has no action "${verb}".` };
        }
    }

    /** The component's outputs, as events. An output fired while the agent's `play` runs is attributed to the agent by the adapter. */
    protected SurfaceEvents(board: TicTacToeBoardComponent): Observable<ChannelSurfaceEvent> {
        return merge(
            outputToObservable(board.Moved).pipe(map((m): ChannelSurfaceEvent => ({ Name: 'moved', Payload: { cell: m.Cell, mark: m.Mark, by: m.Mark === AGENT_MARK ? 'agent' : 'user' } }))),
            outputToObservable(board.GameOver).pipe(map((g): ChannelSurfaceEvent => ({ Name: 'game_over', Payload: { result: g.Result } })))
        );
    }

    /** `open` may say who plays first. */
    protected override OnSurfaceOpen(board: TicTacToeBoardComponent, inputs: JSONObject): void {
        board.UserMark = USER_MARK;
        board.NewGame(inputs['first'] === 'agent' ? AGENT_MARK : USER_MARK);
    }

    /** A finished game is the channel's output. */
    protected override SurfaceCompletion(board: TicTacToeBoardComponent): Observable<JSONObject> {
        return outputToObservable(board.GameOver).pipe(
            map((g): JSONObject => ({ winner: g.Result === 'draw' ? 'draw' : g.Result === USER_MARK ? 'user' : 'agent', moves: g.Moves }))
        );
    }

    /** A board created again (the panel was collapsed and expanded, or the session resumed) is put back as it was. */
    protected override OnSurfaceBound(board: TicTacToeBoardComponent, lastState: JSONObject | null): void {
        board.UserMark = USER_MARK;
        const cells = boardFromRows(lastState?.['board']);
        const turn = lastState?.['turn'];
        if (cells && (turn === 'X' || turn === 'O')) {
            board.Restore(cells, turn);
        } else if (cells) {
            board.Restore(cells, USER_MARK);
        }
    }

    /** What a picture of the channel is taken of (when the host registered a rasterizer and the user allows pixels). */
    protected override SurfaceElement(board: TicTacToeBoardComponent): HTMLElement {
        return board.Element;
    }
}

/**
 * Keeps {@link TicTacToeChannel}'s `@RegisterClass` registration from being tree-shaken. Call it once from the host's
 * startup code; the import and the call are the static reference a bundler cannot eliminate.
 */
export function LoadExampleTicTacToeChannel(): void {
    // no-op: the import + call create a static reference bundlers cannot eliminate
}
