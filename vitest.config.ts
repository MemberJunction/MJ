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
      'packages/AI/Providers/*',
      'packages/AI/Vectors/*',
      'packages/AI/Vectors/Memory/*',
      'packages/AI/AgentManager/*',
      'packages/AI/Recommendations/*',
      'packages/AI/Reranker',
      // Actions
      'packages/Actions/*',
      // Communication, Templates, Scheduling
      'packages/Communication/*',
      'packages/Communication/providers/*',
      'packages/Templates/*',
      'packages/Scheduling/*',
      // Auth, Keys, Credentials
      'packages/APIKeys/*',
      'packages/Credentials/*',
      // Testing, React
      'packages/TestingFramework/*',
      'packages/React/*',
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
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      thresholds: {
        statements: 10,
        branches: 10,
        functions: 10,
        lines: 10,
      },
    },
  },
});
