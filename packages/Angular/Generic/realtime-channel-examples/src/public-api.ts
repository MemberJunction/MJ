/**
 * @packageDocumentation
 *
 * # @memberjunction/ng-realtime-channel-examples
 *
 * Worked examples for building realtime-agent channels. NOT loaded by default and NOT a dependency of anything in
 * MemberJunction: import it, call the `Load...` function, and bring the channel to a session.
 *
 * - {@link TicTacToeChannel}: a channel built only by wrapping a plain Angular component ({@link TicTacToeBoardComponent})
 *   with `AngularComponentChannel`. The walkthrough lives in `guides/REALTIME_CHANNELS_GUIDE.md`.
 */

export * from './lib/tic-tac-toe/tic-tac-toe-engine';
export * from './lib/tic-tac-toe/tic-tac-toe-board.component';
export * from './lib/tic-tac-toe/tic-tac-toe-channel';
