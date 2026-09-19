import type { Href } from 'expo-router';

/**
 * @fileoverview The app's tab destinations, as data.
 *
 * Kept separate from `app/(tabs)/_layout.tsx` so the SET of places this app has is assertable
 * without rendering a navigator — and so a host embedding this shell can read it.
 *
 * This replaces a modal navigation sheet that was reachable from exactly one screen (inside a chat
 * thread), which left the app's own landing screen unable to reach anything. The lesson encoded
 * here: navigation belongs to the shell, not to a screen.
 */

/**
 * One tab. `Route` is the path the tab owns; `Label` is what the bar prints under the icon.
 *
 * Home's route is `/` because Home is the app's INITIAL route, not somewhere it redirects to after
 * booting. That redirect is what made the first tab press after a cold launch do nothing.
 */
export type TabDestination = {
    /** Expo Router route the tab renders. */
    Route: Href;
    /** Label under the icon — short, because a tab bar is four items wide on a phone. */
    Label: string;
    /** Key in the `Icons` map. */
    Icon: 'Home' | 'MessageSquare' | 'Grid' | 'User';
};

/**
 * The tabs, in bar order.
 *
 * Four, deliberately. Five fits on iOS but crowds a small Android device, and Data Explorer — the
 * natural fifth — is somewhere you go on purpose rather than switch between, so it is a first-class
 * card on Home instead. If a fifth ever earns its place, this array is the only thing to change.
 */
export const TAB_DESTINATIONS: TabDestination[] = [
    { Route: '/', Label: 'Home', Icon: 'Home' },
    { Route: '/conversations', Label: 'Chats', Icon: 'MessageSquare' },
    { Route: '/apps', Label: 'Apps', Icon: 'Grid' },
    { Route: '/profile', Label: 'You', Icon: 'User' },
];

/**
 * Destinations reachable from Home but not owned by a tab.
 *
 * Exported so "is everything still reachable?" is one assertion rather than a reading of the JSX —
 * the failure this app already shipped once was a destination nothing linked to.
 */
export const HOME_ONLY_DESTINATIONS: Href[] = ['/explorer'];
