const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

async function handleMJExplorerDirectory(dir, normalizedDir, archive) {
  console.log(`   Handling MJ Explorer directory...`);
  const configFilePath = `${dir}/angular.json`;
  const configFileOutputPath = `${normalizedDir}/angular.json`;
  const configFileContent = fs.readFileSync(configFilePath, 'utf8');
  const configJson = JSON.parse(configFileContent);
  // No longer need to fix hardcoded paths - now using SCSS imports with package resolution
  archive.append(JSON.stringify(configJson, null, 2), { name: configFileOutputPath });

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
      AUTH_TYPE: 'MSAL',
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
    });
  }

  // Clear values for sensitive keys in the environment configuration
  fileContent = clearSensitiveAngularEnvironmentValues(fileContent, isDevelopment);
  if (!fileContent.includes('export const environment = ')) {
    fileContent = `export const environment = ${fileContent}`;
  }

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

  // Add everything in SQL Scripts except the 'internal_only' directory
  archive.glob(
    '**/*',
    {
      cwd: dir,
      ignore: [
        '_all_entities.sql', // Ignore this file
        '_all_entities.permissions.sql', // Ignore this file
        'install/**', // Deprecated folder, migrations are used instead
        'internal_only/**', // Ignore everything in 'internal_only'
        'generated/MJ_BASE/**', // INITIALLY ignore everything in 'MJ_BASE' to apply custom rules later
      ],
    },
    { prefix: normalizedDir }
  );

  // Add all files directly under MJ_BASE
  archive.glob(
    'generated/MJ_BASE/*.*',
    {
      cwd: dir,
      ignore: [
        // Ignore directories at this level, only include files
      ],
    },
    { prefix: normalizedDir }
  );

  // Add everything under the __mj directory, including sub-directories and files
  archive.glob(
    'generated/MJ_BASE/__mj/**',
    {
      cwd: dir,
    },
    { prefix: normalizedDir }
  );
}

async function createMJDistribution() {
  console.log('Starting the process of creating a distribution zip file for MemberJunction...');

  // Get the current date and time in the desired format using native JavaScript
  // const now = new Date();
  // const dateTime = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}`;
  const dateTime = new Date().toISOString().replace(/\W/g, '_').substring(0, 16);

  // Define directories and output
  const directories = [
    'migrations',
    'SQL Scripts',
    'packages/MJAPI',
    'packages/MJExplorer',
    'packages/GeneratedEntities',
    'packages/GeneratedActions',
  ];
  const filename = process.env.MJ_DISTRIBUTION_FILENAME || `Distributions/MemberJunction_Code_Bootstrap_${dateTime}.zip`;
  const output = fs.createWriteStream(filename);
  const archive = archiver('zip');

  console.log('Creating zip file...');
  // Pipe archive data to the output file
  archive.pipe(output);

  // Add directories to zip
  for (const dir of directories) {
    console.log(`Adding ${dir} to zip file...`);
    const normalizedDir = dir.replace('packages/', '');

    if (normalizedDir === 'SQL Scripts') {
      // FOR SQL Scripts we ONLY do this function
      await handleSQLScriptsDirectory(dir, normalizedDir, archive);
    } else {
      // For everything else, we do the general approach but in some cases we pre-process the files for MJExplorer
      if (normalizedDir === 'MJExplorer') {
        await handleMJExplorerDirectory(dir, normalizedDir, archive);
      }

      const gitignore = fs.readFileSync('.gitignore').toString();

      // General Approach Here
      archive.glob(
        `**/*`,
        {
          cwd: dir,
          ignore: [
            ...gitignore.split('\n').filter((l) => l.trim() && !l.trimStart().startsWith('#')),
            'node_modules/**',
            'dist/**',
            '.vscode/**',
            '.angular/**',
            'internal_only/**',
            'package-lock.json',
            '.env',
            'mj.config.js',
            '*.output.txt',
            '*.log',
            '.*', // This will ignore all files that start with a dot
            normalizedDir === 'MJExplorer' ? 'angular.json' : '', // Ignore the original angular.json when adding files from MJExplorer
            normalizedDir === 'MJExplorer' ? 'src/environments/**' : '', // Ignore the original envrioment files when adding files from MJExplorer
            normalizedDir === 'MJExplorer' ? 'kendo-ui-license.txt' : '', // Don't want to include this!
            normalizedDir === 'MJExplorer' ? 'src/app/generated/**' : '', // Don't want to include any of the generated stuff
            normalizedDir === 'GeneratedEntities' ? 'src/generated/**' : '', // Don't want to include any of the generated stuff
            normalizedDir === 'GeneratedActions' ? 'src/generated/**' : '', // Don't want to include any of the generated stuff
            normalizedDir === 'MJAPI' ? 'src/generated/**' : '', // Don't want to include any of the generated stuff
          ],
        },
        { prefix: normalizedDir }
      );
    }
  }

  // Add Update_MemberJunction_Packages_To_Latest.ps1 to the root of the zip
  console.log('Adding Update_MemberJunction_Packages_To_Latest.ps1 to zip file...');
  const latestVersionScriptContent = fs.readFileSync('packages/Update_MemberJunction_Packages_To_Latest.ps1', 'utf8');
  archive.append(latestVersionScriptContent, { name: 'Update_MemberJunction_Packages_To_Latest.ps1' });

  // Add the template for the install.config.json to the root of the zip
  console.log('Adding install.config.json to zip file...');
  const installConfigJson = fs.readFileSync('install.config.json', 'utf8');
  archive.append(installConfigJson, { name: 'install.config.json' });

  // Add the distribution default config file to the root of the zip
  console.log('Adding distribution.config.cjs to zip file...');
  const distributionConfig = fs.readFileSync('distribution.config.cjs', 'utf8');
  archive.append(distributionConfig, { name: 'mj.config.cjs' });

  // Finalize the archive
  console.log('Finalizing creation of zip file...');
  await archive.finalize();
  console.log('Zip file created successfully.');
  console.log(`File name: ${filename}`);
  fs.writeFileSync('CreateMJDistribution.log', filename);
}

// Execute the function
createMJDistribution();
