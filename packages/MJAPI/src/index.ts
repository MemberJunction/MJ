/**
 * MemberJunction API Server (MJ 3.0 Minimal Architecture)
 * All initialization logic is in @memberjunction/server-bootstrap
 */
import { createMJServer } from '@memberjunction/server-bootstrap';
import { createFeedbackHandler } from '@memberjunction/feedback-server';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Import generated packages to trigger class registration
import 'mj_generatedentities';
import 'mj_generatedactions';

// Optional: Import communication providers if needed
// import '@memberjunction/communication-sendgrid';
// import '@memberjunction/communication-teams';

// Optional: Import custom auth/user creation logic
// See: /docs/examples/custom-user-creation/README.md
// import './custom/customUserCreation';

// Resolve resolver paths relative to this file
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const resolverPaths = [resolve(__dirname, 'generated/generated.{js,ts}')];

// Start the server with feedback handler enabled
createMJServer({
  resolverPaths,
  customMiddleware: (app) => {
    // Feedback handler for collecting bug reports and feature requests
    // Requires GITHUB_PAT environment variable with issues:write permission
    if (process.env.GITHUB_PAT) {
      // Note: Type cast needed due to Express type version differences between packages
      const feedbackRouter = createFeedbackHandler({
        owner: process.env.GITHUB_FEEDBACK_OWNER || 'MemberJunction',
        repo: process.env.GITHUB_FEEDBACK_REPO || 'MJ',
        token: process.env.GITHUB_PAT,
        defaultLabels: ['user-submitted', 'explorer'],
        categoryLabels: {
          bug: 'bug',
          feature: 'enhancement',
          question: 'question',
          other: 'triage'
        },
        severityLabels: {
          critical: 'priority: critical',
          major: 'priority: high',
          minor: 'priority: medium',
          trivial: 'priority: low'
        },
        rateLimit: {
          windowMs: 60 * 60 * 1000,  // 1 hour
          maxRequests: 10
        }
      });
      app.use('/api/feedback', feedbackRouter as unknown as Parameters<typeof app.use>[1]);
      console.log('Feedback API enabled at /api/feedback');
    } else {
      console.log('Feedback API disabled (GITHUB_PAT not configured)');
    }
  }
}).catch((err) => {
  console.error('Server error:');
  console.error(err);
  if (err instanceof Error) {
    console.error('Stack:', err.stack);
  }
  process.exit(1);
});