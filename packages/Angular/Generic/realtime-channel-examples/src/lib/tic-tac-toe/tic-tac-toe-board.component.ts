/**
 * @fileoverview A plain tic-tac-toe board component, written the way an app would write it WITHOUT thinking about
 * realtime agents: it owns its state, renders it, accepts clicks and reports what happened through outputs. It has no
 * channel, no agent and no contract in it. `TicTacToeChannel` makes it a channel surface without changing a line here, which
 * is the point of {@link AngularComponentChannel}.
 *
 * Two members carry the whole surface a channel needs: {@link TicTacToeBoardComponent.Play} (the one way a mark gets placed,
 * used by a click and by an agent alike, so the rules are enforced in exactly one place) and the {@link Moved} /
 * {@link GameOver} outputs.
 *
 * @module @memberjunction/ng-realtime-channel-examples
 */

import { ChangeDetectionStrategy, Component, ElementRef, inject, output, signal } from '@angular/core';
import { EmptyCells, FindResult, NewBoard, OtherMark, type TicTacToeCell, type TicTacToeMark, type TicTacToeResult } from './tic-tac-toe-engine';

/** A mark that was placed. */
export interface TicTacToeMove {
    /** Who placed it. */
    Mark: TicTacToeMark;
    /** The cell, 0 to 8. */
    Cell: number;
}

/** The game ended. */
export interface TicTacToeGameOver {
    /** The winning mark, or `'draw'`. */
    Result: TicTacToeResult;
    /** How many marks were placed. */
    Moves: number;
}

/** Why a placement was refused, in terms a player (or an agent) can act on. */
export type TicTacToeRefusal = 'game_over' | 'not_your_turn' | 'occupied' | 'out_of_range';

/** The outcome of {@link TicTacToeBoardComponent.Play}. */
export type TicTacToePlayResult = { Ok: true } | { Ok: false; Reason: TicTacToeRefusal };

/**
 * A tic-tac-toe board the signed-in person plays on by clicking. `X` is the person's mark ({@link UserMark}).
 */
@Component({
    selector: 'mj-example-tic-tac-toe-board',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <p class="status" role="status">{{ StatusText() }}</p>
        <div class="grid" role="grid" aria-label="Tic-tac-toe board">
            @for (cell of Board(); track $index) {
                <button
                    type="button"
                    role="gridcell"
                    class="cell"
                    [attr.data-cell]="$index"
                    [attr.aria-label]="'Cell ' + $index + ', ' + (cell ?? 'empty')"
                    [disabled]="cell !== null || Result() !== null"
                    (click)="OnCellClick($index)"
                >
                    {{ cell }}
                </button>
            }
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                padding: 16px;
                background: var(--mj-bg-surface);
                color: var(--mj-text-primary);
            }
            .status {
                margin: 0 0 12px;
                color: var(--mj-text-secondary);
            }
            .grid {
                display: grid;
                grid-template-columns: repeat(3, 72px);
                gap: 8px;
            }
            .cell {
                height: 72px;
                font-size: 32px;
                font-weight: 600;
                color: var(--mj-text-primary);
                background: var(--mj-bg-surface-card);
                border: 1px solid var(--mj-border-default);
                border-radius: 8px;
                cursor: pointer;
            }
            .cell:hover:not(:disabled) {
                background: var(--mj-bg-surface-hover);
            }
            .cell:focus-visible {
                outline: 2px solid var(--mj-border-focus);
            }
            .cell:disabled {
                cursor: default;
            }
        `,
    ],
})
export class TicTacToeBoardComponent {
    /** The nine cells. */
    public readonly Board = signal<TicTacToeCell[]>(NewBoard());
    /** Whose turn it is; `null` once the game is over. */
    public readonly Turn = signal<TicTacToeMark | null>('X');
    /** How the game ended; `null` while it is on. */
    public readonly Result = signal<TicTacToeResult | null>(null);
    /** The mark the person at the keyboard plays. A click only places this mark. */
    public UserMark: TicTacToeMark = 'X';

    /** Emits every mark placed, whoever placed it. */
    public readonly Moved = output<TicTacToeMove>();
    /** Emits once when the game ends. */
    public readonly GameOver = output<TicTacToeGameOver>();

    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

    /** The component's root element (what a picture of the board is taken of). */
    public get Element(): HTMLElement {
        return this.host.nativeElement;
    }

    /** How many marks are on the board. */
    public MoveCount(): number {
        return this.Board().length - EmptyCells(this.Board()).length;
    }

    /** One line for the status area (also a live region, so a screen reader hears the game progress). */
    public readonly StatusText = (): string => {
        const result = this.Result();
        if (result === 'draw') {
            return 'It is a draw.';
        }
        if (result) {
            return `${result} wins.`;
        }
        return this.Turn() === this.UserMark ? `Your turn (${this.UserMark}).` : `Waiting for ${this.Turn()}.`;
    };

    /**
     * Places a mark. The ONE way a mark gets placed: the board's own click handler and any other caller go through here, so
     * the rules are enforced once.
     *
     * @param mark The mark to place.
     * @param cell The cell, 0 to 8.
     */
    public Play(mark: TicTacToeMark, cell: number): TicTacToePlayResult {
        if (this.Result() !== null) {
            return { Ok: false, Reason: 'game_over' };
        }
        if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
            return { Ok: false, Reason: 'out_of_range' };
        }
        if (this.Turn() !== mark) {
            return { Ok: false, Reason: 'not_your_turn' };
        }
        if (this.Board()[cell] !== null) {
            return { Ok: false, Reason: 'occupied' };
        }
        const board = [...this.Board()];
        board[cell] = mark;
        this.Board.set(board);
        const result = FindResult(board);
        this.Result.set(result);
        this.Turn.set(result === null ? OtherMark(mark) : null);
        this.Moved.emit({ Mark: mark, Cell: cell });
        if (result !== null) {
            this.GameOver.emit({ Result: result, Moves: this.MoveCount() });
        }
        return { Ok: true };
    }

    /** Clears the board; `first` plays first. */
    public NewGame(first: TicTacToeMark = 'X'): void {
        this.Board.set(NewBoard());
        this.Result.set(null);
        this.Turn.set(first);
    }

    /**
     * Puts a known position on the board (a board re-created after the panel was collapsed, or a resumed session). Emits
     * nothing: the position is not a move.
     *
     * @param board The nine cells.
     * @param turn Whose turn it is.
     */
    public Restore(board: readonly TicTacToeCell[], turn: TicTacToeMark): void {
        const result = FindResult(board);
        this.Board.set([...board]);
        this.Result.set(result);
        this.Turn.set(result === null ? turn : null);
    }

    /** The person clicked a cell. */
    protected OnCellClick(cell: number): void {
        this.Play(this.UserMark, cell);
    }
}
