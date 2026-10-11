import { Args, Command, Flags } from '@oclif/core';
import { chmodSync, existsSync, mkdirSync, cpSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import dotenv from 'dotenv';
import ora from 'ora-classic';
import {
  ChooseFreePort,
  ComposeProjectName,
  DEFAULT_PORTS,
  FormatGigabytes,
  GenerateEncryptionKey,
  IsValidEncryptionKey,
  LEGACY_PLACEHOLDER_ENCRYPTION_KEY,
  MIN_DOCKER_MEMORY_BYTES,
  MIN_FREE_DISK_BYTES,
  ReadDockerMemoryBytes,
  ReadFreeDiskBytes,
} from '../../lib/agent-init-preflight.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** AI provider keys the workspace's .env offers; one is enough. */
const PROVIDER_KEY_NAMES = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY'];

/** A setting the user still has to supply, and what happens without it. */
interface MissingSetting {
  Setting: string;
  Consequence: string;
}

export default class AgentInit extends Command {
  static description =
    'Initialize a MemberJunction Citizen Agent Builder environment in the current or specified directory, including Docker setup.';

  static aliases = ['ai:agents:init'];

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> ./my-agent-workspace',
    '<%= config.bin %> <%= command.id %> --no-start',
    '<%= config.bin %> <%= command.id %> --app https://github.com/your-org/your-sample-data',
  ];

  static args = {
    dir: Args.string({
      description: 'Target directory for the agent builder environment (default: current directory).',
      required: false,
      default: '.',
    }),
  };

  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Overwrite existing files in target directory if they already exist.',
      default: false,
    }),
    start: Flags.boolean({
      char: 's',
      description: 'Start Docker containers and run bootstrap immediately after initialization (pass --no-start to skip).',
      default: true,
      allowNo: true,
    }),
    app: Flags.string({
      description: 'Open App Git URL to install for business context (default: More Cheese).',
    }),
    'skip-docker-check': Flags.boolean({
      description:
        'Skip the Docker availability check and assume Docker is running (the stack still starts unless --no-start is passed).',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AgentInit);
    const targetDir = path.resolve(process.cwd(), args.dir);

    this.log(chalk.bold.cyan('\n🚀 MemberJunction Citizen Agent Builder\n'));

    // 1. Resolve template directory
    const templateDir = this.resolveTemplateDir();
    if (!templateDir) {
      this.error(
        chalk.red('✗ Citizen Agent Builder template assets could not be located.\n') +
          'Please ensure @memberjunction/cli is properly installed.'
      );
    }

    // 2. Check Docker availability & attempt auto-launch if stopped on macOS. --skip-docker-check
    //    skips the probe and ASSUMES Docker is available (remote daemon, colima, Podman shim...);
    //    it must not decide Docker is absent, or the stack never starts for exactly those users.
    const dockerAvailable = flags['skip-docker-check'] ? true : this.ensureDockerRunning();

    // 3. Ensure target directory exists
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // 4. Check for existing files
    const agentsMdPath = path.join(targetDir, 'AGENTS.md');
    if (existsSync(agentsMdPath) && !flags.force) {
      this.log(
        chalk.yellow(
          `Target directory '${targetDir}' already contains AGENTS.md.\nUse --force to overwrite existing files.\n`
        )
      );
      return;
    }

    // 5. Scaffold files and settle .env
    const envPath = path.join(targetDir, '.env');
    const spinner = ora('Scaffolding agent builder workspace...').start();
    try {
      cpSync(templateDir, targetDir, { recursive: true });
      this.makeScriptsExecutable(targetDir);
      const envCreated = this.createEnvFromExample(targetDir);
      await this.configureEnv(envPath, targetDir, envCreated, flags.app);
      spinner.succeed(chalk.green('Workspace scaffolded successfully!'));
    } catch (err: unknown) {
      spinner.fail(chalk.red('Failed to scaffold workspace.'));
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error(errorMsg);
    }

    // 6. Check what the first start needs, then start it if it can succeed
    const resourcesOk = flags['skip-docker-check'] || !dockerAvailable || this.reportResources(targetDir);
    this.reportMissingSettings(envPath);
    if (flags.start && dockerAvailable && resourcesOk) {
      this.startEnvironment(targetDir);
    } else {
      if (!dockerAvailable && !flags['skip-docker-check']) {
        this.printDockerInstallInstructions();
      }
      this.printNextSteps(targetDir, dockerAvailable);
    }
  }

  /**
   * This CLI's own version, read from its package.json. Not `this.config.version`: that is the
   * version of whatever package root oclif resolved, which is this CLI only when the command runs
   * through the `mj` binary. Invoked programmatically it can be oclif's own, and a wrong pin here
   * would silently install an unrelated release into the container.
   */
  private cliVersion(): string {
    // Same depth from src/commands/agent and dist/commands/agent, and package.json always ships.
    const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
    const pkg: { name?: string; version?: string } = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.name !== '@memberjunction/cli' || !pkg.version) {
      throw new Error(`Could not determine the @memberjunction/cli version from ${pkgPath}`);
    }
    return pkg.version;
  }

  /**
   * The helper scripts are run as `./scripts/<name>.sh`. A package tarball does not reliably keep
   * the execute bit, and without it every one of them fails with "permission denied".
   */
  private makeScriptsExecutable(targetDir: string): void {
    const scriptsDir = path.join(targetDir, 'scripts');
    if (!existsSync(scriptsDir)) {
      return;
    }
    for (const name of readdirSync(scriptsDir)) {
      if (name.endsWith('.sh') || name.endsWith('.mjs')) {
        chmodSync(path.join(scriptsDir, name), 0o755);
      }
    }
  }

  /** Create .env from .env.example when there is none yet. Returns whether it was created. */
  private createEnvFromExample(targetDir: string): boolean {
    const envExamplePath = path.join(targetDir, '.env.example');
    const envPath = path.join(targetDir, '.env');
    if (existsSync(envExamplePath) && !existsSync(envPath)) {
      copyFileSync(envExamplePath, envPath);
      return true;
    }
    return false;
  }

  /**
   * Fill in what the workspace needs that the user should not have to: the release to install,
   * a unique project name, a valid encryption key, and (for a new .env) free ports. Values the
   * user already set are kept, except that MJ_VERSION always follows this CLI.
   */
  private async configureEnv(envPath: string, targetDir: string, envCreated: boolean, appUrl?: string): Promise<void> {
    if (!existsSync(envPath)) {
      return;
    }
    // Pin the workspace to this CLI's own release. docker-compose.yml requires MJ_VERSION: the
    // container installs this exact CLI and passes it to `mj install --tag`, so the stack cannot
    // drift onto whatever npm's `latest` or the newest GitHub release happens to be.
    this.upsertEnvValue(envPath, 'MJ_VERSION', this.cliVersion());
    if (appUrl) {
      this.upsertEnvValue(envPath, 'OPEN_APP_INSTALL_URL', appUrl);
    }
    const current = dotenv.parse(readFileSync(envPath, 'utf8'));
    if (!current.COMPOSE_PROJECT_NAME) {
      this.upsertEnvValue(envPath, 'COMPOSE_PROJECT_NAME', ComposeProjectName(targetDir));
    }
    this.ensureEncryptionKey(envPath, current.MJ_BASE_ENCRYPTION_KEY ?? '');
    if (envCreated) {
      await this.chooseFreePorts(envPath);
    }
  }

  /** Generate a key when there is none (or the old placeholder that never worked); warn about an invalid one the user set. */
  private ensureEncryptionKey(envPath: string, key: string): void {
    if (!key || key === LEGACY_PLACEHOLDER_ENCRYPTION_KEY) {
      this.upsertEnvValue(envPath, 'MJ_BASE_ENCRYPTION_KEY', GenerateEncryptionKey());
    } else if (!IsValidEncryptionKey(key)) {
      this.warn(
        'MJ_BASE_ENCRYPTION_KEY in .env is not a valid key (it must be 32 random bytes, base64-encoded), so setup will stop until it is fixed. ' +
          'Delete the line to have one generated.'
      );
    }
  }

  /** Move any default port that is already in use (a local SQL Server on 1433 is common) to a free one. */
  private async chooseFreePorts(envPath: string): Promise<void> {
    const claimed = new Set<number>();
    for (const { Key, Port } of DEFAULT_PORTS) {
      const chosen = await ChooseFreePort(Port, claimed);
      if (chosen === undefined) {
        this.warn(`No free port found near ${Port} for ${Key}; set ${Key} in .env before starting.`);
        continue;
      }
      claimed.add(chosen);
      if (chosen !== Port) {
        this.upsertEnvValue(envPath, Key, String(chosen));
        this.log(chalk.yellow(`Port ${Port} is in use on this machine, so ${Key} is set to ${chosen}.`));
      }
    }
  }

  /**
   * Set `key=value` in a dotenv file: replace the active assignment if there is one, otherwise
   * append it. Commented-out example lines are left untouched.
   */
  private upsertEnvValue(envPath: string, key: string, value: string): void {
    const content = readFileSync(envPath, 'utf8');
    const assignment = `${key}=${value}`;
    const activeLine = new RegExp(`^${key}=.*$`, 'm');
    const updated = activeLine.test(content)
      ? content.replace(activeLine, () => assignment)
      : `${content}${content.endsWith('\n') ? '' : '\n'}${assignment}\n`;
    writeFileSync(envPath, updated, 'utf8');
  }

  /**
   * Docker memory and free disk. Below the memory floor the first install is killed for lack of
   * memory part way through, so the stack is not started; returns false in that case.
   */
  private reportResources(targetDir: string): boolean {
    const freeDisk = ReadFreeDiskBytes(targetDir);
    if (freeDisk !== undefined && freeDisk < MIN_FREE_DISK_BYTES) {
      this.log(
        chalk.yellow(
          `⚠️  Only ${FormatGigabytes(freeDisk, 1000)} of disk is free here. One workspace needs about 20 GB ` +
            '(images, database and build cache). Free up space before starting if you can.'
        )
      );
    }
    const memory = ReadDockerMemoryBytes();
    if (memory === undefined || memory >= MIN_DOCKER_MEMORY_BYTES) {
      return true;
    }
    this.log(chalk.yellow(`\n⚠️  Docker has ${FormatGigabytes(memory)} of memory. The first install needs about 12 GB and fails with less.`));
    this.log('   Docker Desktop: Settings → Resources → Memory → 12 GB or more → Apply & restart.');
    this.log('   Then start the workspace with: ' + chalk.cyan('docker compose up -d'));
    return false;
  }

  /** One checklist of what the user still has to supply, asked for up front rather than mid-install. */
  private reportMissingSettings(envPath: string): void {
    if (!existsSync(envPath)) {
      return;
    }
    const missing = this.findMissingSettings(dotenv.parse(readFileSync(envPath, 'utf8')));
    if (missing.length === 0) {
      return;
    }
    this.log(chalk.bold.white('\n📝 Still needed in .env (setup can start without them):'));
    for (const item of missing) {
      this.log(`   • ${chalk.cyan(item.Setting)}: ${item.Consequence}`);
    }
    this.log(chalk.gray('   .env is a hidden file. Open it with: open -e .env (macOS), notepad .env (Windows), or xdg-open .env (Linux).'));
  }

  private findMissingSettings(env: Record<string, string>): MissingSetting[] {
    const missing: MissingSetting[] = [];
    if (!PROVIDER_KEY_NAMES.some((name) => env[name])) {
      missing.push({ Setting: 'an AI provider key (e.g. ANTHROPIC_API_KEY)', Consequence: 'agents cannot call a model until one is set.' });
    }
    if (!env.OWNER_EMAIL) {
      missing.push({ Setting: 'OWNER_EMAIL', Consequence: 'the email you sign in with; without it you cannot run Flow agents from the web app.' });
    }
    const hasEntra = env.ENTRA_TENANT_ID && env.ENTRA_CLIENT_ID;
    const hasAuth0 = env.AUTH0_DOMAIN && env.AUTH0_CLIENT_ID;
    if (!hasEntra && !hasAuth0) {
      missing.push({ Setting: 'ENTRA_* or AUTH0_* sign-in settings', Consequence: 'the Explorer web app cannot sign you in; your IT or platform team usually supplies them.' });
    }
    return missing;
  }

  private resolveTemplateDir(): string | null {
    // 1. Check bundled template ({src,dist}/init-templates/citizen-builder)
    const bundledPath = path.join(__dirname, '..', '..', 'init-templates', 'citizen-builder');
    if (existsSync(bundledPath)) {
      return bundledPath;
    }

    // 2. Check src template when running from dist in dev mode
    const bundledSrcPath = path.join(__dirname, '..', '..', '..', 'src', 'init-templates', 'citizen-builder');
    if (existsSync(bundledSrcPath)) {
      return bundledSrcPath;
    }

    // 3. Check monorepo root fallback (5 levels up from commands/agent)
    const monorepoRootPath = path.resolve(__dirname, '../../../../../citizen-builder');
    if (existsSync(monorepoRootPath)) {
      return monorepoRootPath;
    }

    return null;
  }

  private ensureDockerRunning(): boolean {
    // Step 1: Check if docker daemon is already responsive
    try {
      execSync('docker info', { stdio: 'ignore' });
      return true;
    } catch {
      // Daemon not answering
    }

    // Step 2: If macOS and Docker.app exists, try launching it automatically
    if (process.platform === 'darwin' && existsSync('/Applications/Docker.app')) {
      const launchSpinner = ora('Docker Desktop is installed but not running. Launching Docker Desktop...').start();
      try {
        execSync('open -a Docker', { stdio: 'ignore' });
        // Poll for up to 20 seconds for the daemon socket
        for (let i = 0; i < 20; i++) {
          try {
            execSync('docker info', { stdio: 'ignore' });
            launchSpinner.succeed(chalk.green('Docker Desktop started!'));
            return true;
          } catch {
            execSync('sleep 1');
          }
        }
        launchSpinner.warn(chalk.yellow('Docker Desktop is still initializing in the background.'));
        return false;
      } catch {
        launchSpinner.fail(chalk.yellow('Could not launch Docker Desktop automatically.'));
        return false;
      }
    }

    return false;
  }

  /** Start the stack with Docker's own progress visible: the first start downloads and builds several GB. */
  private startEnvironment(targetDir: string): void {
    this.log(chalk.bold.white('\n🐳 Starting the workspace (docker compose up -d).'));
    this.log('   The first start downloads about 8 GB and builds the MemberJunction image: usually 10 to 20 minutes.');
    try {
      execSync('docker compose up -d', { cwd: targetDir, stdio: 'inherit' });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error(chalk.red('Failed to start containers: ') + errorMsg);
    }

    const env = existsSync(path.join(targetDir, '.env')) ? dotenv.parse(readFileSync(path.join(targetDir, '.env'), 'utf8')) : {};
    this.log(chalk.bold.cyan('\n🎉 Containers started. MemberJunction is now installing itself in the background.'));
    this.log('   The first install takes 20 to 60 minutes (longer on Apple Silicon, where the image runs emulated).');
    this.log(`   Progress, with the current step and how long it usually takes: ${chalk.yellow('.mj-status.json')} in this folder.`);
    this.log(`   Live log: ${chalk.cyan('docker compose logs -f mj')}`);
    this.log(`   When it says "ready": Explorer at ${chalk.green(`http://localhost:${env.EXPLORER_PORT || '4202'}`)}, API at ${chalk.green(`http://localhost:${env.API_PORT || '4000'}`)}`);
    this.printCodingAgentInstructions();
  }

  private printDockerInstallInstructions(): void {
    this.log(chalk.yellow('\n⚠️  Docker Desktop is not installed or not running.'));
    this.log('MemberJunction Agent Builder requires Docker Desktop to run your local database and API.\n');
    this.log(chalk.bold('To install Docker Desktop:'));
    if (process.platform === 'darwin') {
      this.log('  • Download: ' + chalk.cyan('https://www.docker.com/products/docker-desktop'));
      this.log('  • Or install via Homebrew: ' + chalk.cyan('brew install --cask docker'));
    } else if (process.platform === 'win32') {
      this.log('  • Download: ' + chalk.cyan('https://www.docker.com/products/docker-desktop'));
    } else {
      this.log('  • Install Docker Engine: ' + chalk.cyan('https://docs.docker.com/engine/install/'));
    }
  }

  private printNextSteps(targetDir: string, dockerAvailable: boolean): void {
    this.log(chalk.bold.white('\n📋 Next Steps:'));
    this.log(`1. Navigate to your workspace:\n   ${chalk.cyan(`cd ${path.relative(process.cwd(), targetDir) || '.'}`)}`);
    this.log(`2. Fill in the settings listed above in ${chalk.yellow('.env')}`);
    if (dockerAvailable) {
      this.log(`3. Start your local environment:\n   ${chalk.cyan('docker compose up -d')}`);
    } else {
      this.log(`3. Launch Docker Desktop and run:\n   ${chalk.cyan('docker compose up -d')}`);
    }
    this.printCodingAgentInstructions();
  }

  private printCodingAgentInstructions(): void {
    this.log(chalk.bold.green('\n🤖 Ready to Build with your Coding Agent:'));
    this.log('Open your coding agent (Claude Code, Antigravity, Cursor, etc.) in this folder and simply say:');
    this.log(
      chalk.italic.white(
        '  "Build me an agent that scans for overdue invoices and prepares reminder emails."'
      )
    );
    this.log(
      chalk.gray(
        'Your coding agent will read AGENTS.md, author the declarative metadata, and test it against your local database!\n'
      )
    );
  }
}
