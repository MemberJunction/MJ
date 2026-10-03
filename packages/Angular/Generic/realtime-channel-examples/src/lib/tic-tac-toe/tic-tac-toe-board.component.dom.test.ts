import { describe, it, expect } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, attr } from '@memberjunction/ng-test-utils';
import { TicTacToeBoardComponent, type TicTacToeGameOver, type TicTacToeMove, type TicTacToeRefusal } from './tic-tac-toe-board.component';
import type { TicTacToeCell, TicTacToeMark } from './tic-tac-toe-engine';

/**
 * DOM spec for the board's OWN contract (the channel spec in this folder covers how an agent drives it): what it
 * renders for a position, what a click does, which outputs fire and when, and when the cells lock.
 */

type Fixture = ComponentFixture<TicTacToeBoardComponent>;

interface RenderedBoard {
    Fixture: Fixture;
    Moves: TicTacToeMove[];
    Endings: TicTacToeGameOver[];
}

function render(userMark: TicTacToeMark = 'X'): RenderedBoard {
    const moves: TicTacToeMove[] = [];
    const endings: TicTacToeGameOver[] = [];
    const fixture = renderComponentFixture(TicTacToeBoardComponent, {
        setup: (instance) => {
            instance.UserMark = userMark;
            instance.Moved.subscribe((m) => moves.push(m));
            instance.GameOver.subscribe((g) => endings.push(g));
        },
    });
    return { Fixture: fixture, Moves: moves, Endings: endings };
}

/** Lets signal-driven changes reach the DOM. */
async function settle(fixture: Fixture): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
}

const cellButton = (fixture: Fixture, cell: number): HTMLButtonElement => {
    const button = query(fixture, `[data-cell="${cell}"]`);
    if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`no board cell ${cell}`);
    }
    return button;
};

const cellTexts = (fixture: Fixture): string[] => queryAll(fixture, '.cell').map((c) => c.textContent?.trim() ?? '');

/** Plays the given cells in turn order, X first, through the board's own entry point. */
async function playCells(fixture: Fixture, ...cells: number[]): Promise<void> {
    let mark: TicTacToeMark = 'X';
    for (const cell of cells) {
        fixture.componentInstance.Play(mark, cell);
        mark = mark === 'X' ? 'O' : 'X';
    }
    await settle(fixture);
}

describe('TicTacToeBoardComponent (DOM)', () => {
    describe('rendering a fresh board', () => {
        it('renders an accessible grid of nine empty, enabled cells numbered 0 to 8', () => {
            const { Fixture: f } = render();
            expect(attr(f, '.grid', 'role')).toBe('grid');
            expect(attr(f, '.grid', 'aria-label')).toBe('Tic-tac-toe board');
            const cells = queryAll(f, '.cell');
            expect(cells).toHaveLength(9);
            expect(cells.map((c) => c.getAttribute('data-cell'))).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8']);
            expect(cells.every((c) => c.getAttribute('role') === 'gridcell')).toBe(true);
            expect(cells.every((c) => !(c as HTMLButtonElement).disabled)).toBe(true);
            expect(cellTexts(f)).toEqual(Array(9).fill(''));
        });

        it('labels each cell with its index and contents for assistive technology', () => {
            const { Fixture: f } = render();
            expect(attr(f, '[data-cell="0"]', 'aria-label')).toBe('Cell 0, empty');
            expect(attr(f, '[data-cell="8"]', 'aria-label')).toBe('Cell 8, empty');
        });

        it('announces whose turn it is in a status live region', () => {
            const { Fixture: f } = render();
            expect(attr(f, '.status', 'role')).toBe('status');
            expect(text(f, '.status')).toBe('Your turn (X).');
        });

        it('exposes its own element, for taking a picture of the board', () => {
            const { Fixture: f } = render();
            expect(f.componentInstance.Element).toBe(f.nativeElement);
            expect(f.componentInstance.Element.querySelector('.grid')).not.toBeNull();
        });
    });

    describe('a click', () => {
        it("places the user's mark, relabels and locks that cell, and emits Moved", async () => {
            const { Fixture: f, Moves } = render();
            cellButton(f, 4).click();
            await settle(f);
            expect(cellButton(f, 4).textContent?.trim()).toBe('X');
            expect(attr(f, '[data-cell="4"]', 'aria-label')).toBe('Cell 4, X');
            expect(cellButton(f, 4).disabled).toBe(true);
            expect(Moves).toEqual([{ Mark: 'X', Cell: 4 }]);
            expect(f.componentInstance.MoveCount()).toBe(1);
        });

        it('hands the turn over, and the status says so', async () => {
            const { Fixture: f } = render();
            cellButton(f, 0).click();
            await settle(f);
            expect(f.componentInstance.Turn()).toBe('O');
            expect(text(f, '.status')).toBe('Waiting for O.');
        });

        it("does nothing when it is not the user's turn: no mark, no Moved", async () => {
            const { Fixture: f, Moves } = render('O'); // the user plays O, but X moves first
            cellButton(f, 4).click();
            await settle(f);
            expect(cellTexts(f)).toEqual(Array(9).fill(''));
            expect(Moves).toEqual([]);
            expect(text(f, '.status')).toBe('Waiting for X.');
        });

        it('cannot land on a taken cell: the button is disabled, so a second click is a no-op', async () => {
            const { Fixture: f, Moves } = render();
            cellButton(f, 4).click();
            await settle(f);
            cellButton(f, 4).click();
            await settle(f);
            expect(Moves).toHaveLength(1);
            expect(cellButton(f, 4).textContent?.trim()).toBe('X');
        });

        it("places the other mark once the user's turn comes round again", async () => {
            const { Fixture: f, Moves } = render();
            cellButton(f, 0).click();
            await settle(f);
            f.componentInstance.Play('O', 1); // the opponent answers
            await settle(f);
            cellButton(f, 2).click();
            await settle(f);
            expect(Moves.map((m) => `${m.Mark}${m.Cell}`)).toEqual(['X0', 'O1', 'X2']);
            expect(cellTexts(f).slice(0, 3)).toEqual(['X', 'O', 'X']);
        });
    });

    describe('Play, the one way a mark gets placed', () => {
        it.each<[string, TicTacToeMark, number, TicTacToeRefusal]>([
            ['a cell below the board', 'X', -1, 'out_of_range'],
            ['a cell above the board', 'X', 9, 'out_of_range'],
            ['a fractional cell', 'X', 1.5, 'out_of_range'],
            ['the wrong mark for the turn', 'O', 0, 'not_your_turn'],
        ])('refuses %s with the reason %s and changes nothing', async (_label, mark, cell, reason) => {
            const { Fixture: f, Moves } = render();
            expect(f.componentInstance.Play(mark, cell)).toEqual({ Ok: false, Reason: reason });
            await settle(f);
            expect(cellTexts(f)).toEqual(Array(9).fill(''));
            expect(Moves).toEqual([]);
        });

        it('refuses an occupied cell', async () => {
            const { Fixture: f, Moves } = render();
            expect(f.componentInstance.Play('X', 4)).toEqual({ Ok: true });
            expect(f.componentInstance.Play('O', 4)).toEqual({ Ok: false, Reason: 'occupied' });
            await settle(f);
            expect(cellButton(f, 4).textContent?.trim()).toBe('X');
            expect(Moves).toHaveLength(1);
        });
    });

    describe('finishing the game', () => {
        it('a win locks every cell, names the winner and emits GameOver once, after the final Moved', async () => {
            const { Fixture: f, Moves, Endings } = render();
            await playCells(f, 0, 3, 1, 4, 2); // X takes the top row
            expect(Moves).toHaveLength(5);
            expect(Endings).toEqual([{ Result: 'X', Moves: 5 }]);
            expect(text(f, '.status')).toBe('X wins.');
            expect(queryAll(f, '.cell').every((c) => (c as HTMLButtonElement).disabled)).toBe(true);
            expect(f.componentInstance.Turn()).toBeNull();
        });

        it('a full board with no line is a draw, reported with all nine moves', async () => {
            const { Fixture: f, Endings } = render();
            await playCells(f, 0, 1, 2, 4, 3, 5, 7, 6, 8); // X O X / X O O / O X X
            expect(cellTexts(f)).toEqual(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']);
            expect(text(f, '.status')).toBe('It is a draw.');
            expect(Endings).toEqual([{ Result: 'draw', Moves: 9 }]);
        });

        it('ignores a click and refuses a play once the game is over', async () => {
            const { Fixture: f, Moves } = render();
            await playCells(f, 0, 3, 1, 4, 2);
            const before = Moves.length;
            expect(f.componentInstance.Play('O', 8)).toEqual({ Ok: false, Reason: 'game_over' });
            cellButton(f, 8).click();
            await settle(f);
            expect(Moves).toHaveLength(before);
            expect(cellButton(f, 8).textContent?.trim()).toBe('');
        });

        it('says the opponent won when the opponent completes a line', async () => {
            const { Fixture: f } = render();
            await playCells(f, 0, 3, 1, 4, 8, 5); // O takes the middle row
            expect(text(f, '.status')).toBe('O wins.');
        });
    });

    describe('NewGame', () => {
        it('clears the board, reopens every cell and lets X start by default', async () => {
            const { Fixture: f } = render();
            await playCells(f, 0, 3, 1, 4, 2);
            f.componentInstance.NewGame();
            await settle(f);
            expect(cellTexts(f)).toEqual(Array(9).fill(''));
            expect(queryAll(f, '.cell').every((c) => !(c as HTMLButtonElement).disabled)).toBe(true);
            expect(text(f, '.status')).toBe('Your turn (X).');
            expect(f.componentInstance.Result()).toBeNull();
        });

        it('can hand the first move to the opponent', async () => {
            const { Fixture: f, Moves } = render();
            f.componentInstance.NewGame('O');
            await settle(f);
            expect(text(f, '.status')).toBe('Waiting for O.');
            cellButton(f, 0).click(); // the user is X: not their turn
            await settle(f);
            expect(Moves).toEqual([]);
        });

        it('lets a finished game be played again, reporting the new ending', async () => {
            const { Fixture: f, Endings } = render();
            await playCells(f, 0, 3, 1, 4, 2);
            f.componentInstance.NewGame();
            await playCells(f, 6, 0, 7, 1, 8);
            expect(Endings.map((e) => e.Result)).toEqual(['X', 'X']);
            expect(text(f, '.status')).toBe('X wins.');
        });
    });

    describe('Restore', () => {
        it('puts a known position on screen and emits nothing, since a position is not a move', async () => {
            const { Fixture: f, Moves, Endings } = render();
            const position: TicTacToeCell[] = ['X', null, null, null, 'O', null, null, null, null];
            f.componentInstance.Restore(position, 'X');
            await settle(f);
            expect(cellTexts(f)).toEqual(['X', '', '', '', 'O', '', '', '', '']);
            expect(cellButton(f, 0).disabled).toBe(true);
            expect(cellButton(f, 1).disabled).toBe(false);
            expect(text(f, '.status')).toBe('Your turn (X).');
            expect(Moves).toEqual([]);
            expect(Endings).toEqual([]);
        });

        it('shows an already-won position as finished (cells locked, winner named) without re-announcing the ending', async () => {
            const { Fixture: f, Endings } = render();
            const won: TicTacToeCell[] = ['O', 'O', 'O', 'X', 'X', null, null, null, null];
            f.componentInstance.Restore(won, 'X');
            await settle(f);
            expect(text(f, '.status')).toBe('O wins.');
            expect(queryAll(f, '.cell').every((c) => (c as HTMLButtonElement).disabled)).toBe(true);
            expect(f.componentInstance.Turn()).toBeNull();
            expect(Endings).toEqual([]);
        });

        it('does not alias the array it was given: later play does not mutate the caller\'s position', async () => {
            const { Fixture: f } = render();
            const position: TicTacToeCell[] = Array<TicTacToeCell>(9).fill(null);
            f.componentInstance.Restore(position, 'X');
            f.componentInstance.Play('X', 4);
            await settle(f);
            expect(position[4]).toBeNull();
            expect(cellButton(f, 4).textContent?.trim()).toBe('X');
        });
    });
});
