import { readFileSync, writeFileSync } from 'node:fs';
import { SqlGlotClient } from '@memberjunction/sqlglot-ts';
import type { TranspileResult } from '@memberjunction/sqlglot-ts';
import { SQLFileSplitter } from './SQLFileSplitter.js';
import { NoOpLLMFallback } from './LLMFallback.js';
import type {
  ConversionPipelineConfig,
  ConversionResult,
  StatementResult,
  ILLMFallback,
  IDatabaseVerifier,
} from './types.js';

/**
 * Orchestrates SQL file conversion from one dialect to another.
 *
 * Pipeline steps:
 * 1. Read source SQL (from file or string)
 * 2. Split into individual statements
 * 3. Transpile each statement via sqlglot
 * 4. Optionally verify against target database
 * 5. Optionally use LLM fallback for failed statements
 * 6. Write output and generate statistics
 */
export class ConversionPipeline {
  private client: SqlGlotClient | null = null;
  private readonly splitter = new SQLFileSplitter();

  /**
   * Run the conversion pipeline.
   * Manages the sqlglot client lifecycle internally.
   */
  async Run(config: ConversionPipelineConfig): Promise<ConversionResult> {
    const startTime = Date.now();
    const log = config.onProgress ?? (() => {});

    // Read source SQL
    log('Reading source SQL...');
    const sourceSQL = config.sourceIsFile
      ? readFileSync(config.source, 'utf-8')
      : config.source;

    // Split into statements
    log('Splitting into statements...');
    const statements = this.splitter.Split(sourceSQL, config.sourceDialect);
    log(`Found ${statements.length} statements`);

    if (statements.length === 0) {
      return this.buildResult([], '', config, startTime);
    }

    // Start sqlglot client
    log('Starting sqlglot transpiler...');
    this.client = new SqlGlotClient();
    await this.client.start();

    const llmFallback: ILLMFallback = config.llmFallbackHandler ?? new NoOpLLMFallback();
    const verifier = config.verifier;

    try {
      const results: StatementResult[] = [];

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        log(`[${i + 1}/${statements.length}] Converting...`);

        const result = await this.processStatement(
          i,
          stmt,
          config,
          llmFallback,
          verifier,
          log
        );

        results.push(result);

        if (!result.success && config.stopOnError) {
          log(`Stopping on error at statement ${i + 1}: ${result.error}`);
          break;
        }
      }

      // Build output SQL
      const outputParts: string[] = [];
      for (const r of results) {
        if (r.success) {
          outputParts.push(r.convertedSQL);
        } else {
          outputParts.push(`-- CONVERSION FAILED (statement ${r.index + 1}): ${r.error ?? 'unknown error'}\n-- Original: ${r.originalSQL.slice(0, 200).replace(/\n/g, '\n-- ')}`);
        }
      }
      const outputSQL = outputParts.join(';\n\n') + (outputParts.length > 0 ? ';' : '');

      // Write output file
      if (config.outputFile) {
        log(`Writing output to ${config.outputFile}...`);
        writeFileSync(config.outputFile, outputSQL, 'utf-8');
      }

      return this.buildResult(results, outputSQL, config, startTime);
    } finally {
      // Always clean up
      if (this.client) {
        await this.client.stop();
        this.client = null;
      }
      if (verifier) {
        await verifier.Close();
      }
    }
  }

  /**
   * Process a single statement through the conversion pipeline.
   */
  private async processStatement(
    index: number,
    originalSQL: string,
    config: ConversionPipelineConfig,
    llmFallback: ILLMFallback,
    verifier: IDatabaseVerifier | undefined,
    log: (msg: string) => void
  ): Promise<StatementResult> {
    // Step 1: Try sqlglot transpilation
    let transpileResult: TranspileResult;
    try {
      transpileResult = await this.client!.transpile(originalSQL, {
        fromDialect: config.sourceDialect,
        toDialect: config.targetDialect,
        pretty: config.pretty,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        index,
        originalSQL,
        convertedSQL: '',
        success: false,
        verified: false,
        method: 'failed',
        error: `sqlglot transpile error: ${error}`,
      };
    }

    if (!transpileResult.success || transpileResult.errors.length > 0) {
      // sqlglot failed — try LLM fallback
      if (config.llmFallback) {
        return this.tryLLMFallback(
          index,
          originalSQL,
          transpileResult.sql,
          transpileResult.errors.join('; '),
          config,
          llmFallback,
          verifier,
          log
        );
      }
      return {
        index,
        originalSQL,
        convertedSQL: transpileResult.sql,
        success: false,
        verified: false,
        method: 'failed',
        error: transpileResult.errors.join('; '),
      };
    }

    let convertedSQL = transpileResult.sql;
    // Remove trailing semicolons added by sqlglot — we add our own
    convertedSQL = convertedSQL.replace(/;\s*$/, '').trim();

    // Step 2: Optionally verify against target database
    if (config.verify && verifier) {
      const verifyError = await verifier.Verify(convertedSQL);
      if (verifyError) {
        log(`  Verification failed: ${verifyError.slice(0, 100)}`);
        // Try LLM fallback for verification failures
        if (config.llmFallback) {
          return this.tryLLMFallback(
            index,
            originalSQL,
            convertedSQL,
            verifyError,
            config,
            llmFallback,
            verifier,
            log
          );
        }
        return {
          index,
          originalSQL,
          convertedSQL,
          success: false,
          verified: false,
          method: 'sqlglot',
          error: `Verification failed: ${verifyError}`,
        };
      }
    }

    return {
      index,
      originalSQL,
      convertedSQL,
      success: true,
      verified: config.verify && verifier !== undefined,
      method: 'sqlglot',
    };
  }

  /**
   * Attempt LLM-based fix for a failed conversion.
   */
  private async tryLLMFallback(
    index: number,
    originalSQL: string,
    failedSQL: string,
    error: string,
    config: ConversionPipelineConfig,
    llmFallback: ILLMFallback,
    verifier: IDatabaseVerifier | undefined,
    log: (msg: string) => void
  ): Promise<StatementResult> {
    let lastError = error;
    let currentFailedSQL = failedSQL;

    for (let attempt = 0; attempt < config.maxLLMRetries; attempt++) {
      log(`  LLM fallback attempt ${attempt + 1}/${config.maxLLMRetries}...`);

      const llmResult = await llmFallback.FixConversion(
        originalSQL,
        currentFailedSQL,
        lastError,
        config.sourceDialect,
        config.targetDialect
      );

      if (!llmResult.sql) {
        return {
          index,
          originalSQL,
          convertedSQL: currentFailedSQL,
          success: false,
          verified: false,
          method: 'failed',
          error: `LLM fallback returned null after ${attempt + 1} attempts. Last error: ${lastError}`,
        };
      }

      let llmSQL = llmResult.sql.replace(/;\s*$/, '').trim();

      // Verify LLM output if verification is enabled
      if (config.verify && verifier) {
        const verifyError = await verifier.Verify(llmSQL);
        if (verifyError) {
          log(`  LLM output verification failed: ${verifyError.slice(0, 100)}`);
          lastError = verifyError;
          currentFailedSQL = llmSQL;
          continue; // Retry with LLM
        }
      }

      return {
        index,
        originalSQL,
        convertedSQL: llmSQL,
        success: true,
        verified: config.verify && verifier !== undefined,
        method: 'llm',
        llmModel: llmResult.model,
      };
    }

    return {
      index,
      originalSQL,
      convertedSQL: currentFailedSQL,
      success: false,
      verified: false,
      method: 'failed',
      error: `LLM fallback exhausted ${config.maxLLMRetries} retries. Last error: ${lastError}`,
    };
  }

  private buildResult(
    statements: StatementResult[],
    outputSQL: string,
    config: ConversionPipelineConfig,
    startTime: number
  ): ConversionResult {
    const successCount = statements.filter((s) => s.success).length;
    const failureCount = statements.filter((s) => !s.success).length;
    const sqlglotCount = statements.filter((s) => s.method === 'sqlglot' && s.success).length;
    const llmCount = statements.filter((s) => s.method === 'llm' && s.success).length;
    const passthroughCount = statements.filter((s) => s.method === 'passthrough').length;

    return {
      success: failureCount === 0,
      totalStatements: statements.length,
      successCount,
      failureCount,
      sqlglotCount,
      llmCount,
      passthroughCount,
      statements,
      outputFile: config.outputFile,
      outputSQL,
      durationMs: Date.now() - startTime,
    };
  }
}
