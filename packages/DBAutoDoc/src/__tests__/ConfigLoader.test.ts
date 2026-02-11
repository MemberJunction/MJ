import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigLoader } from '../utils/config-loader';

describe('ConfigLoader', () => {
  describe('createDefault', () => {
    it('should return a valid default configuration', () => {
      const config = ConfigLoader.createDefault();

      expect(config.version).toBe('1.0.0');
      expect(config.database).toBeDefined();
      expect(config.ai).toBeDefined();
      expect(config.analysis).toBeDefined();
      expect(config.output).toBeDefined();
      expect(config.schemas).toBeDefined();
      expect(config.tables).toBeDefined();
    });

    it('should set sensible database defaults', () => {
      const config = ConfigLoader.createDefault();

      expect(config.database.server).toBe('localhost');
      expect(config.database.port).toBe(1433);
      expect(config.database.encrypt).toBe(true);
      expect(config.database.trustServerCertificate).toBe(false);
      expect(config.database.connectionTimeout).toBe(30000);
    });

    it('should set sensible AI defaults', () => {
      const config = ConfigLoader.createDefault();

      expect(config.ai.provider).toBe('gemini');
      expect(config.ai.model).toBe('gemini-3-flash-preview');
      expect(config.ai.temperature).toBe(0.1);
      expect(config.ai.maxTokens).toBe(4000);
    });

    it('should set sensible analysis defaults', () => {
      const config = ConfigLoader.createDefault();

      expect(config.analysis.cardinalityThreshold).toBe(20);
      expect(config.analysis.sampleSize).toBe(10);
      expect(config.analysis.includeStatistics).toBe(true);
      expect(config.analysis.includePatternAnalysis).toBe(true);
    });

    it('should set convergence defaults', () => {
      const config = ConfigLoader.createDefault();

      expect(config.analysis.convergence.maxIterations).toBe(10);
      expect(config.analysis.convergence.stabilityWindow).toBe(2);
      expect(config.analysis.convergence.confidenceThreshold).toBe(0.85);
    });

    it('should set backpropagation defaults', () => {
      const config = ConfigLoader.createDefault();

      expect(config.analysis.backpropagation.enabled).toBe(true);
      expect(config.analysis.backpropagation.maxDepth).toBe(3);
    });

    it('should set sanity check defaults', () => {
      const config = ConfigLoader.createDefault();

      expect(config.analysis.sanityChecks.dependencyLevel).toBe(true);
      expect(config.analysis.sanityChecks.schemaLevel).toBe(true);
      expect(config.analysis.sanityChecks.crossSchema).toBe(true);
    });

    it('should exclude common system schemas by default', () => {
      const config = ConfigLoader.createDefault();

      expect(config.schemas.exclude).toContain('sys');
      expect(config.schemas.exclude).toContain('INFORMATION_SCHEMA');
    });

    it('should exclude common system tables by default', () => {
      const config = ConfigLoader.createDefault();

      expect(config.tables.exclude).toContain('sysdiagrams');
      expect(config.tables.exclude).toContain('__MigrationHistory');
    });

    it('should set output file paths', () => {
      const config = ConfigLoader.createDefault();

      expect(config.output.stateFile).toBeDefined();
      expect(config.output.sqlFile).toBeDefined();
      expect(config.output.markdownFile).toBeDefined();
    });
  });
});
