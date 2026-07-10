# @memberjunction/communication-expo-push

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/communication-types@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/communication-types@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Minor Changes

- 6db5dc5: Add a new Expo push notification channel provider (`@memberjunction/communication-expo-push`). It registers via `@RegisterClass(BaseCommunicationProvider, 'Expo Push')` and sends push notifications through the Expo Push API using the same `CommunicationEngine` as the email/SMS providers, mapping the framework message model (To → device token, Subject → title, Body → body, ContextData → data) to the Expo push payload and handling ok/error tickets. Used by the MemberJunction mobile app for agent-completion / approval notifications.

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/communication-types@5.45.0
