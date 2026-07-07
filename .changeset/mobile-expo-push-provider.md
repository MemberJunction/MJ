---
"@memberjunction/communication-expo-push": minor
---

Add a new Expo push notification channel provider (`@memberjunction/communication-expo-push`). It registers via `@RegisterClass(BaseCommunicationProvider, 'Expo Push')` and sends push notifications through the Expo Push API using the same `CommunicationEngine` as the email/SMS providers, mapping the framework message model (To → device token, Subject → title, Body → body, ContextData → data) to the Expo push payload and handling ok/error tickets. Used by the MemberJunction mobile app for agent-completion / approval notifications.
