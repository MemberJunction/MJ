/**
 * Patch the MJAPI mj.config.cjs at image-bake time for the test environment:
 *
 *  - autoCreateNewUsers: true              — create the test user on first Auth0 login
 *  - newUserRoles: UI + Integration        — Integration grants CRUD on most entities
 *  - CreateUserApplicationRecords: true    — auto-pin apps when the user is created
 *  - contextUserForNewUserCreation: pinned to a known sentinel address
 *
 * The combination ensures the test user gets full access without manual SQL.
 *
 * Invoked from Dockerfile.api as the final RUN step before EXPOSE.
 */

const fs = require('fs');

const CONFIG_PATH = process.env.MJ_CONFIG_PATH || 'mj.config.cjs';

let c = fs.readFileSync(CONFIG_PATH, 'utf8');

c = c.replace(
    /autoCreateNewUsers:.*?,/,
    'autoCreateNewUsers: true,'
);
c = c.replace(
    /newUserRoles:.*?\],/,
    "newUserRoles: ['UI', 'Integration'],"
);
c = c.replace(
    /contextUserForNewUserCreation:.*?,/,
    "contextUserForNewUserCreation: 'not.set@nowhere.com', CreateUserApplicationRecords: true,"
);

fs.writeFileSync(CONFIG_PATH, c);
console.log('Patched mj.config.cjs for test environment');
