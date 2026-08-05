# Mobile UI E2E flows (Maestro)

End-to-end UI flows for the MJ mobile app, driven by [Maestro](https://maestro.mobile.dev)
against the iOS Simulator. These complement the two non-UI suites:

- **Unit tests** — `npm test` (Vitest, mocked backend). Pure-logic layer.
- **Integration tests** — `npm run test:integration` (Vitest, **live MJAPI**). Service
  layer against a real backend. See [`../src/__tests__/integration/README.md`](../src/__tests__/integration/README.md).
- **UI E2E (this folder)** — Maestro drives the real app in the simulator.

## Flows

| Flow | What it verifies |
|---|---|
| `01-boot-smoke.yaml` | Authenticated cold launch lands on the Conversations home. |
| `02-new-conversation.yaml` | Tapping "New conversation" opens the composer / agent rail. |
| `03-interactive-component.yaml` | An agent-authored React component compiles **on-device** (react-runtime + Babel + the web-primitive→RN shim) and is genuinely interactive — taps the compiled `<button>` and asserts the `useState` counter advances 0→1→2. |
| `04-render-showcase.yaml` | The native renderers produce output without crashing — prismjs-highlighted code, the HTML→RN renderer, and the SVG charts. |

Flows 03–04 deep-link into the dev-harness routes (`/interactive-demo`,
`/markdown-preview`). The first custom-scheme open may raise an "Open in MJ Mobile?"
system prompt; the flows dismiss it automatically (optional step).

## Prerequisites

1. **Maestro** + a JDK (`brew install openjdk`, then the Maestro install script).
2. **Metro** running: `npm start` (from `packages/MobileApp/`).
3. **MJAPI** running on `:4001` against a migrated 5.x database.
4. The app **installed and authenticated** on a booted simulator (a valid token in
   secure-store). Interactive Auth0 login (`mjmobile://auth`) or a seeded dev token
   both satisfy this.

## Run

```bash
export JAVA_HOME="$(brew --prefix openjdk)/libexec/openjdk.jdk/Contents/Home"
export PATH="$HOME/.maestro/bin:$JAVA_HOME/bin:$PATH"

# one flow
maestro test .maestro/03-interactive-component.yaml

# the whole suite
maestro test .maestro/
```
