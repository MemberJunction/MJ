const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

/**
 * Strip comments from JSON-with-comments (tsconfig.json style).
 * Handles both // line comments and /* block comments while preserving strings.
 */
function stripJsonComments(jsonString) {
  let result = '';
  let i = 0;
  const len = jsonString.length;

  while (i < len) {
    // Handle strings - copy them verbatim
    if (jsonString[i] === '"') {
      result += jsonString[i++];
      while (i < len && jsonString[i] !== '"') {
        if (jsonString[i] === '\\' && i + 1 < len) {
          result += jsonString[i++]; // backslash
          result += jsonString[i++]; // escaped char
        } else {
          result += jsonString[i++];
        }
      }
      if (i < len) result += jsonString[i++]; // closing quote
    }
    // Handle single-line comments
    else if (jsonString[i] === '/' && jsonString[i + 1] === '/') {
      // Skip until end of line
      while (i < len && jsonString[i] !== '\n') i++;
    }
    // Handle multi-line comments
    else if (jsonString[i] === '/' && jsonString[i + 1] === '*') {
      i += 2; // skip /*
      while (i < len && !(jsonString[i] === '*' && jsonString[i + 1] === '/')) i++;
      i += 2; // skip */
    }
    // Regular character
    else {
      result += jsonString[i++];
    }
  }

  return result;
}

/**
 * Parse JSON that may contain comments (like tsconfig.json files).
 */
function parseJsonWithComments(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(stripJsonComments(content));
}

/**
 * Deep merge two objects, with source taking precedence over base.
 * Arrays are replaced, not merged.
 */
function deepMerge(base, source) {
  const result = { ...base };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(base[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Flatten a tsconfig.json by merging its "extends" base config inline.
 * This removes the dependency on root-level tsconfig files for distribution.
 * @param {string} tsconfigPath - Path to the package's tsconfig.json
 * @param {string} baseConfigName - Name of base config ('tsconfig.server.json' or 'tsconfig.angular.json')
 * @returns {object} The flattened tsconfig object
 */
function flattenTsconfig(tsconfigPath, baseConfigName) {
  const packageConfig = parseJsonWithComments(tsconfigPath);
  const baseConfig = parseJsonWithComments(baseConfigName);

  // Remove the extends property
  delete packageConfig.extends;

  // Merge base config with package config (package config takes precedence)
  const merged = deepMerge(baseConfig, packageConfig);

  return merged;
}

/**
 * Handle tsconfig.json for server-side packages (MJAPI, GeneratedEntities, GeneratedActions)
 */
function handleServerTsconfig(dir, normalizedDir, archive) {
  console.log(`   Flattening tsconfig.json for ${normalizedDir}...`);
  const tsconfigPath = path.join(dir, 'tsconfig.json');
  const flattened = flattenTsconfig(tsconfigPath, 'tsconfig.server.json');

  // Clean up monorepo-specific paths that won't work in distribution
  if (flattened.exclude) {
    flattened.exclude = flattened.exclude.filter(p => !p.includes('../../node_modules'));
  }

  archive.append(JSON.stringify(flattened, null, 2), { name: path.join(normalizedDir, 'tsconfig.json') });
}

/**
 * Handle tsconfig.json for MJExplorer (Angular app)
 */
function handleAngularTsconfig(dir, normalizedDir, archive) {
  console.log(`   Flattening tsconfig.json for ${normalizedDir}...`);
  const tsconfigPath = path.join(dir, 'tsconfig.json');
  const flattened = flattenTsconfig(tsconfigPath, 'tsconfig.angular.json');

  // Remove monorepo-specific path aliases that reference local workspace packages
  // In distribution, these packages come from npm and don't need path overrides
  if (flattened.compilerOptions && flattened.compilerOptions.paths) {
    const pathsToRemove = ['@memberjunction/ng-bootstrap'];
    for (const pathKey of pathsToRemove) {
      if (flattened.compilerOptions.paths[pathKey]) {
        console.log(`      Removed monorepo path alias: ${pathKey}`);
        delete flattened.compilerOptions.paths[pathKey];
      }
    }
    // If paths object is now empty, remove it
    if (Object.keys(flattened.compilerOptions.paths).length === 0) {
      delete flattened.compilerOptions.paths;
    }
  }

  archive.append(JSON.stringify(flattened, null, 2), { name: path.join(normalizedDir, 'tsconfig.json') });
}

function handleMJExplorerPackageJson(dir, normalizedDir, archive) {
  console.log(`   Processing MJExplorer package.json to remove monorepo-specific port settings...`);
  const packageJsonPath = path.join(dir, 'package.json');
  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonContent);

  // Remove --port flags from scripts (monorepo uses 4201 to avoid conflicts, distribution should use default 4200)
  if (packageJson.scripts) {
    for (const [scriptName, scriptCommand] of Object.entries(packageJson.scripts)) {
      if (typeof scriptCommand === 'string' && scriptCommand.includes('--port')) {
        // Remove --port and its value (handles both "--port 4201" and "--port=4201" formats)
        packageJson.scripts[scriptName] = scriptCommand.replace(/\s*--port[=\s]+\d+/g, '');
        console.log(`      Removed --port flag from script: ${scriptName}`);
      }
    }
  }

  // Append modified package.json to archive
  archive.append(JSON.stringify(packageJson, null, 2), { name: path.join(normalizedDir, 'package.json') });
}

async function handleMJExplorerDirectory(dir, normalizedDir, archive) {
  console.log(`   Handling MJ Explorer directory...`);
  const configFilePath = `${dir}/angular.json`;
  const configFileOutputPath = `${normalizedDir}/angular.json`;
  const configFileContent = fs.readFileSync(configFilePath, 'utf8');
  const configJson = JSON.parse(configFileContent);
  // No longer need to fix hardcoded paths - now using SCSS imports with package resolution
  archive.append(JSON.stringify(configJson, null, 2), { name: configFileOutputPath });

  // Handle package.json - remove monorepo-specific port settings
  handleMJExplorerPackageJson(dir, normalizedDir, archive);

  // now handle the environment files (environment.ts, environment.development.ts, environment.staging.ts)
  await handleSingleEnvironmentFile(dir, normalizedDir, archive, 'src/environments/', 'environment.ts', false);
  await handleSingleEnvironmentFile(dir, normalizedDir, archive, 'src/environments/', 'environment.development.ts', true);
  await handleSingleEnvironmentFile(dir, normalizedDir, archive, 'src/environments/', 'environment.staging.ts', false);
}

async function handleSingleEnvironmentFile(dir, normalizedDir, archive, subDir, fileName, isDevelopment) {
  const filePath = path.join(dir, subDir, fileName);
  let fileContent = '';
  try {
    fileContent = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    fileContent = JSON.stringify({
      GRAPHQL_URI: isDevelopment ? 'http://localhost:4000/' : '',
      GRAPHQL_WS_URI: isDevelopment ? 'ws://localhost:4000/' : '',
      REDIRECT_URI: isDevelopment ? 'http://localhost:4200/' : '',
      CLIENT_ID: '',
      TENANT_ID: '',
      CLIENT_AUTHORITY: '',
      AUTH_TYPE: 'msal',
      NODE_ENV: isDevelopment ? 'development' : 'production',
      AUTOSAVE_DEBOUNCE_MS: 1200,
      SEARCH_DEBOUNCE_MS: 800,
      MIN_SEARCH_LENGTH: 3,
      MJ_CORE_SCHEMA_NAME: '__mj',
      production: !isDevelopment && !fileName.includes('staging'),
      APPLICATION_NAME: 'CDP',
      APPLICATION_INSTANCE: isDevelopment ? 'DEV' : fileName.includes('staging') ? 'STAGE' : 'PROD',
      AUTH0_DOMAIN: '',
      AUTH0_CLIENTID: '',
    }, null, 2);
  }

  // Clear values for sensitive keys in the environment configuration
  fileContent = clearSensitiveAngularEnvironmentValues(fileContent, isDevelopment);
  if (!fileContent.includes('export const environment = ')) {
    fileContent = `export const environment = ${fileContent}`;
  }

  // Convert AUTH_TYPE to TypeScript 'as const' syntax
  fileContent = fileContent.replace(/"AUTH_TYPE":\s*"msal"/, "AUTH_TYPE: 'msal' as const");

  // Append modified content to the archive
  archive.append(fileContent, { name: path.join(normalizedDir, subDir, fileName) });
}

function clearSensitiveAngularEnvironmentValues(content, isDevelopment) {
  const keysToClear = ['CLIENT_ID', 'TENANT_ID', 'CLIENT_AUTHORITY', 'AUTH0_DOMAIN', 'AUTH0_CLIENTID'];
  if (!isDevelopment) {
    keysToClear.push('GRAPHQL_URI');
    keysToClear.push('GRAPHQL_WS_URI');
    keysToClear.push('REDIRECT_URI');
  }

  keysToClear.forEach((key) => {
    const regex = new RegExp(`(${key}:\\s*)'.*?'`, 'g');
    content = content.replace(regex, `$1''`);
  });

  return content;
}

async function handleSQLScriptsDirectory(dir, normalizedDir, archive) {
  console.log(`   Handling SQL Scripts directory...`);

  // Add everything in SQL Scripts except 'internal_only' and 'generated' directories
  archive.glob(
    '**/*',
    {
      cwd: dir,
      ignore: [
        '_all_entities.sql', // Ignore this file
        '_all_entities.permissions.sql', // Ignore this file
        'install/**', // Deprecated folder, migrations are used instead
        'internal_only/**', // Ignore everything in 'internal_only'
        'generated/**', // Exclude all generated SQL scripts (will be regenerated by CodeGen on client)
      ],
    },
    { prefix: normalizedDir }
  );

  // Create an empty 'generated' directory for CodeGen output
  archive.append('', {
    name: path.join(normalizedDir, 'generated', '.gitkeep'),
    mode: 0o644
  });
}

async function createMJDistribution() {
  console.log('Starting the process of creating a distribution zip file for MemberJunction...');

  // Get the current date and time in the desired format using native JavaScript
  // const now = new Date();
  // const dateTime = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}`;
  const dateTime = new Date().toISOString().replace(/\W/g, '_').substring(0, 16);

  // Define directories and output
  // Map source directories to their destination in the distribution
  const directories = [
    { source: 'migrations', dest: 'migrations' },
    { source: 'SQL Scripts', dest: 'SQL Scripts' },
    { source: 'packages/MJAPI', dest: 'apps/MJAPI' },
    { source: 'packages/MJExplorer', dest: 'apps/MJExplorer' },
    { source: 'packages/GeneratedEntities', dest: 'packages/GeneratedEntities' },
    { source: 'packages/GeneratedActions', dest: 'packages/GeneratedActions' },
  ];
  const filename = process.env.MJ_DISTRIBUTION_FILENAME || `Distributions/MemberJunction_Code_Bootstrap_${dateTime}.zip`;
  const output = fs.createWriteStream(filename);
  const archive = archiver('zip');

  console.log('Creating zip file...');
  // Pipe archive data to the output file
  archive.pipe(output);

  // Add directories to zip
  for (const dirConfig of directories) {
    const dir = dirConfig.source;
    const zipPath = dirConfig.dest;
    console.log(`Adding ${dir} to zip file (as ${zipPath})...`);
    // For special handling, use a simplified name
    const dirName = dir.replace('packages/', '').replace('apps/', '');

    if (dirName === 'SQL Scripts') {
      // FOR SQL Scripts we ONLY do this function
      await handleSQLScriptsDirectory(dir, zipPath, archive);
    } else {
      // For everything else, we do the general approach but in some cases we pre-process the files
      if (dirName === 'MJExplorer') {
        await handleMJExplorerDirectory(dir, zipPath, archive);
        handleAngularTsconfig(dir, zipPath, archive);
      }

      // Handle server-side packages - flatten their tsconfig.json
      if (dirName === 'MJAPI' || dirName === 'GeneratedEntities' || dirName === 'GeneratedActions') {
        handleServerTsconfig(dir, zipPath, archive);
      }

      // Build ignore patterns based on directory type
      // NOTE: We don't use .gitignore patterns here because they're designed for the repo root
      // and don't work correctly when archiver's glob uses cwd set to a subdirectory
      const ignorePatterns = [
        'node_modules/**',
        'dist/**',
        '.turbo/**',
        '.vscode/**',
        '.angular/**',
        'internal_only/**',
        'package-lock.json',
        '.env',
        'mj.config.js',
        '*.output.txt',
        '*.log',
        '.*', // Ignore all files that start with a dot
      ];

      // Add directory-specific exclusions
      if (dirName === 'MJExplorer') {
        ignorePatterns.push('package.json'); // Ignore the original package.json (we handle it separately to remove monorepo-specific ports)
        ignorePatterns.push('angular.json'); // Ignore the original angular.json (we handle it separately)
        ignorePatterns.push('tsconfig.json'); // Ignore the original tsconfig.json (we flatten it to remove extends)
        ignorePatterns.push('src/environments/**'); // Ignore the original environment files (we handle them separately)
        ignorePatterns.push('kendo-ui-license.txt'); // Don't want to include this!
        ignorePatterns.push('src/app/generated/**'); // Exclude generated Angular forms (regenerated by CodeGen on client)
      }

      if (dirName === 'GeneratedEntities' || dirName === 'GeneratedActions' || dirName === 'MJAPI') {
        ignorePatterns.push('src/generated/**'); // Exclude generated code (regenerated by CodeGen on client)
        ignorePatterns.push('tsconfig.json'); // Ignore the original tsconfig.json (we flatten it to remove extends)
      }

      if (dirName === 'migrations') {
        ignorePatterns.push('**/*.md'); // Exclude all markdown files (documentation and reports)
        ignorePatterns.push('**/*.backup'); // Exclude backup files
      }

      // General Approach Here
      archive.glob(
        `**/*`,
        {
          cwd: dir,
          ignore: ignorePatterns,
        },
        { prefix: zipPath }
      );
    }
  }

  // Add monorepo configuration files
  console.log('Adding package.json to zip file...');
  const packageJsonContent = fs.readFileSync('distribution.package.json', 'utf8');
  archive.append(packageJsonContent, { name: 'package.json' });

  console.log('Adding turbo.json to zip file...');
  const turboJsonContent = fs.readFileSync('distribution.turbo.json', 'utf8');
  archive.append(turboJsonContent, { name: 'turbo.json' });

  console.log('Adding README.md to zip file...');
  const readmeContent = fs.readFileSync('distribution.README.md', 'utf8');
  archive.append(readmeContent, { name: 'README.md' });

  // Add Update_MemberJunction_Packages_To_Latest.ps1 to the root of the zip
  console.log('Adding Update_MemberJunction_Packages_To_Latest.ps1 to zip file...');
  const latestVersionScriptContent = fs.readFileSync('packages/Update_MemberJunction_Packages_To_Latest.ps1', 'utf8');
  archive.append(latestVersionScriptContent, { name: 'Update_MemberJunction_Packages_To_Latest.ps1' });

  // Add the template for the install.config.json to the root of the zip
  console.log('Adding install.config.json to zip file...');
  const installConfigJson = fs.readFileSync('install.config.json', 'utf8');
  archive.append(installConfigJson, { name: 'install.config.json' });

  // Add the distribution config file to the root of the zip
  // v3.0+ uses minimal config with DEFAULT_CODEGEN_CONFIG from @memberjunction/codegen-lib
  // Database settings come from environment variables, not from config file
  console.log('Adding distribution.config.cjs to zip file...');
  const distributionConfig = fs.readFileSync('distribution.config.cjs', 'utf8');
  archive.append(distributionConfig, { name: 'mj.config.cjs' });

  // NOTE: Root tsconfig files (tsconfig.server.json, tsconfig.angular.json) are NOT shipped.
  // Instead, each package's tsconfig.json is flattened to include the base config inline.
  // This keeps customer environments simple without root-level config dependencies.

  // Finalize the archive
  console.log('Finalizing creation of zip file...');
  await archive.finalize();
  console.log('Zip file created successfully.');
  console.log(`File name: ${filename}`);
  fs.writeFileSync('CreateMJDistribution.log', filename);
}

// Execute the function
createMJDistribution();
