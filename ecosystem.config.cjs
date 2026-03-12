/**
 * PM2 ecosystem configuration for MJAPI.
 *
 * Used by the RSU pipeline to manage MJAPI lifecycle (restart after schema changes).
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart mjapi
 *   pm2 logs mjapi
 */
module.exports = {
  apps: [
    {
      name: 'mjapi',
      cwd: './packages/MJAPI',
      script: 'node',
      args: '--experimental-specifier-resolution=node --import ./register.js -r dotenv/config ./src/index.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: 'development',
        // Explicitly pass DB vars — dotenv loads from CWD (packages/MJAPI)
        // but .env lives at repo root. PM2 env block ensures they're available.
        DOTENV_CONFIG_PATH: '../../.env',
      },
      // Don't auto-restart on crash during RSU — we handle lifecycle ourselves
      autorestart: false,
      // Increase memory limit for CodeGen-heavy workloads
      max_memory_restart: '2G',
      // Merge stdout/stderr for simpler log reading
      merge_logs: true,
    },
  ],
};
