/**
 * @fileoverview The rules of tic-tac-toe as pure functions: no Angular, no DOM, no channel. This is the layer an
 * existing app already has; the board component and the channel in this folder are written on top of it and neither
 * re-implements a rule.
 *
 * Cells are numbered 0 to 8, left to right and top to bottom:
 *
 * ```
 *  0 | 1 | 2
 *  3 | 4 | 5
 *  6 | 7 | 8
 * ```
 *
 * @module @memberjunction/ng-realtime-channel-examples
 */

/** A player's mark. */
export type TicTacToeMark = 'X' | 'O';

/** One cell: a mark, or `null` when empty. */
export type TicTacToeCell = TicTacToeMark | null;

/** How a finished game ended: a winning mark, or a draw. */
export type TicTacToeResult = TicTacToeMark | 'draw';

/** The eight winning lines, as cell indexes. */
export const TIC_TAC_TOE_LINES: ReadonlyArray<readonly [number, number, number]> = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];

/** An empty board. */
export function NewBoard(): TicTacToeCell[] {
    return Array<TicTacToeCell>(9).fill(null);
}

/** The opponent of a mark. */
export function OtherMark(mark: TicTacToeMark): TicTacToeMark {
    return mark === 'X' ? 'O' : 'X';
}

/**
 * Whether the game is over, and how.
 *
 * @param board The nine cells.
 * @returns The winning mark, `'draw'` when the board is full with no winner, or `null` while the game is still on.
 */
export function FindResult(board: readonly TicTacToeCell[]): TicTacToeResult | null {
    for (const [a, b, c] of TIC_TAC_TOE_LINES) {
        const mark = board[a];
        if (mark && mark === board[b] && mark === board[c]) {
            return mark;
        }
    }
    return board.every((cell) => cell !== null) ? 'draw' : null;
}

/** The cells that are still empty, in order. */
export function EmptyCells(board: readonly TicTacToeCell[]): number[] {
    return board.flatMap((cell, index) => (cell === null ? [index] : []));
}
