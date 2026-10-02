---
"@memberjunction/mobile-app": patch
---

Give the app a home screen and a tab bar.

Navigation previously lived in exactly one place: a hamburger inside a chat thread that opened a
modal sheet. The screen the app launches into could therefore not reach Apps, Data Explorer or
Profile at all — you had to open a conversation to find the way out of conversations. The landing
screen also carried two controls with no `onPress` at all: a filter button and a search button that
rendered, depressed, and did nothing.

There is now a persistent four-tab bar (Home, Chats, Apps, You) and a real Home: a greeting, the two
primary actions (type, or talk), the threads worth continuing, the agents you can address, and doors
to Data Explorer and Apps. Home is the app's INITIAL route rather than somewhere it redirects to
after booting, and the boot gate wraps the shell instead of sitting in it as a route.

MJ Explorer uses a sidebar and this deliberately does not mirror it: a phone has no room for one,
and both platforms' users read a bottom bar as "these are the places this app has". The screens
inside still match Explorer element for element — only the chrome differs.

Also pins `@babel/core` and `@types/react` as singletons in the workspace overrides. Their peer
variation was producing **two copies of `react-native@0.81.5`**, and therefore two copies of
`@react-navigation/native` — so `expo-router` populated one `LinkingContext` while the tab bar read
another and threw `MISSING_CONTEXT_ERROR` on render. Same failure mode as the CodeMirror singleton
collapse, and it would have bitten anything else relying on a React context from those packages.
