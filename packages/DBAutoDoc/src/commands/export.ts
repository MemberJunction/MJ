/**
 * Export command - Generate SQL and Markdown documentation
 */

import { Command, Flags, Interfaces } from '@oclif/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { ConfigLoader } from '../utils/config-loader.js';
import { StateManager } from '../state/StateManager.js';
import { SQLGenerator } from '../generators/SQLGenerator.js';
import { MarkdownGenerator } from '../generators/MarkdownGenerator.js';
import { ReportGenerator } from '../generators/ReportGenerator.js';
import { HTMLGenerator } from '../generators/HTMLGenerator.js';
import { CSVGenerator } from '../generators/CSVGenerator.js';
import { MermaidGenerator } from '../generators/MermaidGenerator.js';
import { ErdClusterer, ErdClusterPlan } from '../generators/ErdClusterer.js';
import { ErdClusterGenerator } from '../generators/ErdClusterGenerator.js';
import { ERD_DEFAULTS, ErdColumnMode, ErdConfig, ErdMode } from '../types/config.js';
import { AdditionalSchemaInfoGenerator } from '../generators/AdditionalSchemaInfoGenerator.js';
import { PluginManager } from '../plugins/PluginManager.js';
import type { AutoDocExporter, AutoDocExporterOptions, AutoDocPluginConfigEntry } from '../plugins/types.js';
import type { DatabaseDocumentation } from '../types/state.js';
// DatabaseConnection is lazy-imported only when --apply is used (requires DB credentials)

/** Sub-directory of the output directory that holds the subject-area diagrams. */
const ERD_CLUSTER_DIR = 'erd';

const ERD_MODES: ErdMode[] = ['full', 'clusters', 'both'];
const ERD_COLUMN_MODES: ErdColumnMode[] = ['all', 'keys', 'none'];

type ExportFlags = Interfaces.InferredFlags<typeof Export.flags>;

export default class Export extends Command {
  static description = 'Export documentation in multiple formats (SQL, Markdown, HTML, CSV, Mermaid)';

  static examples = [
    '$ db-auto-doc export --state-file=./db-doc-state.json',
    '$ db-auto-doc export --sql',
    '$ db-auto-doc export --markdown',
    '$ db-auto-doc export --html',
    '$ db-auto-doc export --csv',
    '$ db-auto-doc export --mermaid',
    '$ db-auto-doc export --sql --markdown --html --csv --mermaid --apply',
    '$ db-auto-doc export --mermaid --erd-mode clusters',
    '$ db-auto-doc export --html --mermaid --erd-mode clusters --erd-hub-min-inbound 12 --erd-page-size 40'
  ];

  static flags = {
    'state-file': Flags.string({ description: 'Path to state JSON file', char: 's' }),
    'output-dir': Flags.string({ description: 'Output directory for generated files', char: 'o' }),
    sql: Flags.boolean({ description: 'Generate SQL script' }),
    markdown: Flags.boolean({ description: 'Generate Markdown documentation' }),
    html: Flags.boolean({ description: 'Generate interactive HTML documentation' }),
    csv: Flags.boolean({ description: 'Generate CSV exports (tables and columns)' }),
    mermaid: Flags.boolean({ description: 'Generate Mermaid ERD diagram files' }),
    report: Flags.boolean({ description: 'Generate analysis report' }),
    'schema-info': Flags.boolean({ description: 'Generate additionalSchemaInfo.json for CodeGen soft FK/PK support' }),
    'schema-info-discovered-only': Flags.boolean({ description: 'Only include AI-discovered keys in schema info (exclude hard DB constraints)', default: false }),
    'schema-info-confirmed-only': Flags.boolean({ description: 'Only include confirmed candidates in schema info', default: false }),
    apply: Flags.boolean({ description: 'Apply SQL to database', default: false }),
    'approved-only': Flags.boolean({ description: 'Only export approved items', default: false }),
    'confidence-threshold': Flags.string({ description: 'Minimum confidence threshold', default: '0' }),
    'erd-mode': Flags.custom<ErdMode>({ options: ERD_MODES })({
      description: 'ERD layout: full (one diagram), clusters (one per subject area), both. Overrides output.erd.mode'
    }),
    'erd-columns': Flags.custom<ErdColumnMode>({ options: ERD_COLUMN_MODES })({
      description: 'Columns drawn per entity: all, keys (PK/FK only), none. Overrides output.erd.columns'
    }),
    'erd-hub-min-inbound': Flags.integer({
      min: 1,
      description: `A table referenced by at least this many tables is a subject-area hub (default ${ERD_DEFAULTS.hubMinInbound})`
    }),
    'erd-lookup-max-rows': Flags.integer({
      min: 1,
      description: `A table that references nothing and has fewer rows than this is a reference table, listed not drawn (default ${ERD_DEFAULTS.lookupMaxRows})`
    }),
    'erd-page-size': Flags.integer({
      min: 1,
      description: `Tables per diagram page beyond the hub (default ${ERD_DEFAULTS.pageSize})`
    }),
    'erd-min-cluster-size': Flags.integer({
      min: 1,
      description: `Subject areas smaller than this fold into a neighbour (default ${ERD_DEFAULTS.minClusterSize})`
    }),
    format: Flags.string({
      description: 'Plugin export format to generate (repeatable). See --list-formats.',
      multiple: true
    }),
    'list-formats': Flags.boolean({ description: 'List the export formats contributed by plugins and exit', default: false }),
    provider: Flags.string({
      description: 'Database platform for dialect-specific output (defaults to the state file, then config, then sqlserver)',
      options: ['sqlserver', 'mysql', 'postgresql']
    }),
    'file-prefix': Flags.string({ description: 'File name prefix override for plugin exports (e.g. a migration version prefix)' })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Export);
    const spinner = ora();

    try {
      // Determine state file path
      let stateFilePath: string;
      let outputDir: string;
      let config: any = null;

      if (flags['state-file']) {
        // Direct state file mode - no config needed
        stateFilePath = path.resolve(flags['state-file']);
        outputDir = flags['output-dir']
          ? path.resolve(flags['output-dir'])
          : path.dirname(stateFilePath);
      } else {
        // Config-based mode (original behavior)
        spinner.start('Loading configuration');
        config = await ConfigLoader.load('./config.json');
        spinner.succeed('Configuration loaded');
        stateFilePath = config.output.stateFile;
        outputDir = path.dirname(config.output.sqlFile);
      }

      // Load state
      spinner.start('Loading state');
      const stateManager = new StateManager(stateFilePath);
      const state = await stateManager.load();

      if (!state) {
        throw new Error(`No state file found at ${stateFilePath}. Run "db-auto-doc analyze" first.`);
      }

      spinner.succeed('State loaded');

      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Plugin-contributed formats (--format / --list-formats)
      const exporters = await this.loadPluginExporters(config?.plugins);
      if (flags['list-formats']) {
        this.listFormats(exporters);
        return;
      }
      if (flags.format?.length) {
        const provider = (flags.provider ?? state.database.provider ?? config?.database?.provider ?? 'sqlserver') as AutoDocExporterOptions['Provider'];
        await this.runPluginExports(flags.format, exporters, state, outputDir, { Provider: provider, FileNamePrefix: flags['file-prefix'] }, spinner);
      }

      // Default to SQL + Markdown if no specific format flags provided
      const anyFormatSpecified = flags.sql || flags.markdown || flags.html || flags.csv || flags.mermaid || flags.report || flags['schema-info'] || !!flags.format?.length;
      const generateSQL = flags.sql || !anyFormatSpecified;
      const generateMarkdown = flags.markdown || !anyFormatSpecified;
      const generateHTML = flags.html;
      const generateCSV = flags.csv;
      const generateMermaid = flags.mermaid;

      // Prepare generator options. The SQL generator is dialect-aware (PostgreSQL
      // emits COMMENT ON; SQL Server emits sp_addextendedproperty), so pass the
      // configured provider through; defaults to 'sqlserver' when no config.
      const generatorOptions = {
        approvedOnly: flags['approved-only'],
        confidenceThreshold: parseFloat(flags['confidence-threshold']),
        provider: (config?.database?.provider as 'sqlserver' | 'postgresql') || 'sqlserver'
      };

      // Generate SQL
      if (generateSQL) {
        spinner.start('Generating SQL script');
        const sqlGen = new SQLGenerator();
        const sql = sqlGen.generate(state, generatorOptions);

        const sqlPath = path.join(outputDir, 'extended-props.sql');
        await fs.writeFile(sqlPath, sql, 'utf-8');
        spinner.succeed(`SQL script saved to ${sqlPath}`);

        // Apply to database if requested
        if (flags.apply) {
          if (!config) {
            this.warn('--apply requires a config file. Skipping database application.');
          } else {
            spinner.start('Applying SQL to database');
            const { DatabaseConnection } = await import('../database/Database.js');
            const dbConfig = {
              provider: (config.database.provider as 'sqlserver' | 'postgresql') || 'sqlserver',
              host: config.database.server,
              port: config.database.port,
              database: config.database.database,
              user: config.database.user,
              password: config.database.password,
              encrypt: config.database.encrypt,
              trustServerCertificate: config.database.trustServerCertificate
            };
            const db = new DatabaseConnection(dbConfig);
            await db.connect();

            const result = await db.query(sql);
            await db.close();

            if (result.success) {
              spinner.succeed('SQL applied successfully');
            } else {
              spinner.fail(`SQL application failed: ${result.errorMessage}`);
            }
          }
        }
      }

      // Generate Markdown
      if (generateMarkdown) {
        spinner.start('Generating Markdown documentation');
        const mdGen = new MarkdownGenerator();
        const markdown = mdGen.generate(state);

        const mdPath = path.join(outputDir, 'summary.md');
        await fs.writeFile(mdPath, markdown, 'utf-8');
        spinner.succeed(`Markdown documentation saved to ${mdPath}`);
      }

      // ERD options: export flags override config.output.erd, which overrides the defaults.
      const erd = this.resolveErdConfig(config?.output?.erd, flags);
      // The plan is built whenever an output needs it: the HTML's Subject Areas section links to the
      // cluster pages, so requesting --html in clusters mode also writes them.
      let clusterPlan: ErdClusterPlan | undefined = (generateMermaid || generateHTML) && erd.mode !== 'full'
        ? new ErdClusterer().Plan(state, erd)
        : undefined;
      for (const warning of clusterPlan?.Warnings ?? []) {
        this.warn(`ERD ${warning}`);
      }
      if (clusterPlan && clusterPlan.Clusters.length === 0) {
        // Nothing is referenced often enough to anchor an area: fall back to the single diagram
        // rather than leaving the documentation with no ERD at all.
        this.warn(`ERD: no table is referenced by at least ${clusterPlan.Options.hubMinInbound} others, so there are no subject areas; `
          + 'drawing the full diagram instead (lower --erd-hub-min-inbound to cluster)');
        clusterPlan = undefined;
        erd.mode = 'full';
      }

      // Generate HTML
      if (generateHTML) {
        spinner.start('Generating HTML documentation');
        const htmlGen = new HTMLGenerator();
        const html = htmlGen.generate(state, { ...generatorOptions, clusterPlan, clusterDir: ERD_CLUSTER_DIR });

        const htmlPath = path.join(outputDir, 'documentation.html');
        await fs.writeFile(htmlPath, html, 'utf-8');
        spinner.succeed(`HTML documentation saved to ${htmlPath}`);
      }

      // Generate CSV
      if (generateCSV) {
        spinner.start('Generating CSV exports');
        const csvGen = new CSVGenerator();
        const csvExport = csvGen.generate(state, generatorOptions);

        const tablesPath = path.join(outputDir, 'tables.csv');
        const columnsPath = path.join(outputDir, 'columns.csv');

        await fs.writeFile(tablesPath, csvExport.tables, 'utf-8');
        await fs.writeFile(columnsPath, csvExport.columns, 'utf-8');

        spinner.succeed(`CSV exports saved to ${tablesPath} and ${columnsPath}`);
      }

      // Generate Mermaid: the schema-wide diagram, the clustered subject areas, or both
      if (generateMermaid) {
        if (erd.mode === 'full' || erd.mode === 'both') {
          spinner.start('Generating Mermaid diagram');
          const mermaidGen = new MermaidGenerator();
          const fullOptions = { ...generatorOptions, columns: erd.columns === 'keys' || erd.columns === 'none' ? erd.columns : 'all' as const };
          const mermaidDiagram = mermaidGen.generate(state, fullOptions);
          const mermaidHtml = mermaidGen.generateHtml(state, fullOptions);

          const mermaidPath = path.join(outputDir, 'erd.mmd');
          const mermaidHtmlPath = path.join(outputDir, 'erd.html');

          await fs.writeFile(mermaidPath, mermaidDiagram, 'utf-8');
          await fs.writeFile(mermaidHtmlPath, mermaidHtml, 'utf-8');

          spinner.succeed(`Mermaid diagram saved to ${mermaidPath} and ${mermaidHtmlPath}`);
        }
      }
      if (clusterPlan) {
        spinner.start('Generating subject-area diagrams');
        const clusterGen = new ErdClusterGenerator();
        const output = clusterGen.Generate(state, clusterPlan, { columns: erd.columns ?? 'keys' });
        const clusterDir = path.join(outputDir, ERD_CLUSTER_DIR);
        await fs.mkdir(clusterDir, { recursive: true });
        for (const file of output.Files) {
          await fs.writeFile(path.join(clusterDir, `${file.BaseName}.mmd`), file.Mermaid, 'utf-8');
          await fs.writeFile(path.join(clusterDir, `${file.BaseName}.html`), file.Html, 'utf-8');
        }
        await fs.writeFile(path.join(clusterDir, 'index.html'), output.IndexHtml, 'utf-8');
        await fs.writeFile(path.join(clusterDir, 'index.md'), output.IndexMarkdown, 'utf-8');
        const largest = output.Files.reduce((n, f) => Math.max(n, f.Mermaid.length), 0);
        spinner.succeed(`${clusterPlan.Clusters.length} subject areas (${output.Files.length} diagram pages, largest ${largest.toLocaleString()} chars) saved to ${clusterDir}`);
      }

      // Generate Report
      if (flags.report) {
        spinner.start('Generating analysis report');
        const reportGen = new ReportGenerator(stateManager);
        const report = reportGen.generate(state);

        const reportPath = path.join(outputDir, 'analysis-report.md');
        await fs.writeFile(reportPath, report, 'utf-8');
        spinner.succeed(`Analysis report saved to ${reportPath}`);
      }

      // Generate Additional Schema Info (for CodeGen soft FK/PK)
      if (flags['schema-info']) {
        spinner.start('Generating additional schema info for CodeGen');
        const schemaInfoGen = new AdditionalSchemaInfoGenerator();
        const schemaInfo = schemaInfoGen.generate(state, {
          ApprovedOnly: flags['approved-only'],
          ConfidenceThreshold: parseFloat(flags['confidence-threshold']),
          DiscoveredOnly: flags['schema-info-discovered-only'],
          ConfirmedOnly: flags['schema-info-confirmed-only']
        });

        const schemaInfoPath = path.join(outputDir, 'additionalSchemaInfo.json');
        await fs.writeFile(schemaInfoPath, schemaInfo, 'utf-8');
        spinner.succeed(`Additional schema info saved to ${schemaInfoPath}`);
      }

      this.log(chalk.green('\n✓ Export complete!'));

    } catch (error) {
      spinner.fail('Export failed');
      this.error((error as Error).message);
    }
  }

  /** Merge the ERD settings: defaults, then config.output.erd, then the export flags. */
  private resolveErdConfig(configured: ErdConfig | undefined, flags: ExportFlags): ErdConfig & { mode: ErdMode } {
    return {
      ...configured,
      mode: flags['erd-mode'] ?? configured?.mode ?? 'full',
      columns: flags['erd-columns'] ?? configured?.columns,
      hubMinInbound: flags['erd-hub-min-inbound'] ?? configured?.hubMinInbound,
      lookupMaxRows: flags['erd-lookup-max-rows'] ?? configured?.lookupMaxRows,
      pageSize: flags['erd-page-size'] ?? configured?.pageSize,
      minClusterSize: flags['erd-min-cluster-size'] ?? configured?.minClusterSize,
    };
  }

  /** Loads built-in plugins plus any external plugin modules named in the config. */
  private async loadPluginExporters(entries: AutoDocPluginConfigEntry[] | undefined): Promise<AutoDocExporter[]> {
    const plugins = new PluginManager();
    await plugins.Load(entries);
    return plugins.GetExporters();
  }

  private listFormats(exporters: AutoDocExporter[]): void {
    if (exporters.length === 0) {
      this.log('No plugin export formats are available.');
      return;
    }
    for (const e of exporters) {
      this.log(`${chalk.cyan(e.Format)}  ${e.Description}`);
    }
  }

  private async runPluginExports(
    formats: string[],
    exporters: AutoDocExporter[],
    state: DatabaseDocumentation,
    outputDir: string,
    options: AutoDocExporterOptions,
    spinner: ReturnType<typeof ora>
  ): Promise<void> {
    for (const format of formats) {
      const exporter = exporters.find((e) => e.Format.toLowerCase() === format.toLowerCase());
      if (!exporter) {
        const known = exporters.map((e) => e.Format).join(', ') || '(none)';
        throw new Error(`Unknown export format '${format}'. Available: ${known}`);
      }
      spinner.start(`Generating ${exporter.Format}`);
      const files = exporter.Generate(state, options);
      for (const file of files) {
        await fs.writeFile(path.join(outputDir, file.FileName), file.Content, 'utf-8');
      }
      spinner.succeed(`${exporter.Format}: ${files.length ? files.map((f) => f.FileName).join(', ') : 'nothing to export'}`);
    }
  }
}
