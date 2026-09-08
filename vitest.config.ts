import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      // Core infrastructure
      'packages/MJGlobal',
      'packages/MJCore',
      'packages/MJServer',
      'packages/MJStorage',
      'packages/SQLServerDataProvider',
      'packages/Config',
      'packages/Encryption',
      'packages/MJCoreEntities',
      'packages/CodeGenLib',
      'packages/MetadataSync',
      'packages/GraphQLDataProvider',
      'packages/DBAutoDoc',
      'packages/MJExportEngine',
      'packages/MarkdownCore',
      'packages/Angular/Generic/markdown',
      'packages/ContentAutotagging',
      // AI packages
      'packages/AI/Agents',
      'packages/AI/BaseAIEngine',
      'packages/AI/Core',
      'packages/AI/CorePlus',
      'packages/AI/Engine',
      'packages/AI/MCPClient',
      'packages/AI/MCPServer',
      'packages/AI/AICLI',
      'packages/AI/Prompts',
      // Vitest 4: a wildcard project entry must resolve to CONFIG FILES (a bare
      // 'packages/X/*' glob matches READMEs etc. and errors at startup — which is
      // why the dormant `test:coverage` script never actually ran).
      'packages/AI/Providers/*/vitest.config.ts',
      'packages/AI/Vectors/*/vitest.config.ts',
      // Two-level nests need their own glob — `AI/Vectors/*` stops one level short of
      // Vectors/Providers/<X>, which silently dropped 4 tested packages from coverage.
      'packages/AI/Vectors/Providers/*/vitest.config.ts',
      'packages/AI/AgentManager/*/vitest.config.ts',
      'packages/AI/Recommendations/*/vitest.config.ts',
      'packages/AI/Reranker',
      // Actions
      'packages/Actions/*/vitest.config.ts',
      // BizApps is a second level under Actions/ — `Actions/*` alone dropped 5 tested packages.
      'packages/Actions/BizApps/*/vitest.config.ts',
      // Communication, Templates, Scheduling
      'packages/Communication/*/vitest.config.ts',
      'packages/Communication/providers/*/vitest.config.ts',
      'packages/Templates/*/vitest.config.ts',
      'packages/Scheduling/*/vitest.config.ts',
      // Auth, Keys, Credentials
      'packages/APIKeys/*/vitest.config.ts',
      'packages/Credentials/*/vitest.config.ts',
      // Testing, React
      'packages/TestingFramework/*/vitest.config.ts',
      'packages/React/*/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      enabled: false,
      reportsDirectory: './coverage',
      include: [
        'packages/*/src/**/*.ts',
        'packages/*/*/src/**/*.ts',
        'packages/*/*/*/src/**/*.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/generated/**',
        '**/dist/**',
        '**/node_modules/**',
        '**/*.d.ts',
      ],
      // 'json-summary' feeds the nightly coverage job's step summary (coverage-summary.json).
      reporter: ['text', 'text-summary', 'json', 'json-summary', 'html', 'lcov'],
      // Report-only for now — no thresholds. The nightly coverage job publishes the
      // baseline; add per-package ratchets only once real numbers exist, otherwise the
      // first instrumented run goes red on an arbitrary floor nobody measured.
    },
  },
});
