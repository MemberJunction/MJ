/**
 * MemberJunction API Server (MJ 3.0 Minimal Architecture)
 * All initialization logic is in @memberjunction/server-bootstrap
 */
import { createMJServer } from '@memberjunction/server-bootstrap';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Import generated packages to trigger class registration
import 'mj_generatedentities';
import 'mj_generatedactions';

// Import pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import '@memberjunction/server-bootstrap/mj-class-registrations';

// Import supplemental manifest for user-defined classes (generated at prestart with --exclude-packages @memberjunction)
import './generated/class-registrations-manifest.js';

// Board Game Night business rules. Registering the entity subclass HERE is what makes the rules
// server-side: without it, an Action, an agent, or a direct API mutation resolves the plain generated
// 'Play Sessions' class and every invariant is silently bypassed — the UI would enforce them and the
// agent would not. The manifest above cannot cover this package: it is generated with
// `--exclude-packages @memberjunction`, and this package is @memberjunction/*.
import { LoadGameNightEntities } from '@memberjunction/gamenight';
LoadGameNightEntities();

// The agent-facing write. Same tree-shaking reasoning: BaseAction subclasses are resolved through
// ClassFactory by name, so the call is what keeps the module in the bundle.
import { LoadLogPlaySessionAction } from './custom/log-play-session.action.js';
LoadLogPlaySessionAction();
import { LoadAddGameAction } from './custom/add-game.action.js';
LoadAddGameAction();

// Optional: Import communication providers if needed
// import '@memberjunction/communication-sendgrid';
// import '@memberjunction/communication-teams';

// Optional: Import custom auth/user creation logic
// See: /docs/examples/custom-user-creation/README.md
// import './custom/customUserCreation';

// Resolve resolver paths relative to this file
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const resolverPaths = [resolve(__dirname, 'generated/generated.{js,ts}')];

// Start the server
createMJServer({ resolverPaths }).catch(console.error);