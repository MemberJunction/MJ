const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

async function handleCodeGenDirectory(dir, normalizedDir, archive) {
  console.log(`   Handling CodeGen directory...`);

  const configFilePath = `${dir}/config.json`;
  const configFileOutputPath = `${normalizedDir}/config.json`;
  const configFileContent = fs.readFileSync(configFilePath, 'utf8');
  const configJson = JSON.parse(configFileContent);

  if (configJson.output) {
    configJson.output = configJson.output.filter(
      (item) =>
        item.type &&
        item.type.trim().toLowerCase() !== 'coreentitysubclasses' &&
        item.type.trim().toLowerCase() !== 'graphqlcoreentityresolvers' &&
        item.type.trim().toLowerCase() !== 'angularcoreentities'
    ); // remove these as we don't want people using MJ to ever generated this stuff.

    // next up, we add "__mj" to the list of exclude schemas as we don't want people using MJ to ever generate stuff in the __mj schema.
    // Add "__mj" to the "excludeSchemas" array
    if (configJson.excludeSchemas) {
      configJson.excludeSchemas.push('__mj');
    } else {
      configJson.excludeSchemas = ['__mj'];
    }

    // next up, we need to remove one level of directory from output path if our type = DBSchemaJSON or type = SQL
    configJson.output.forEach((item) => {
      if (item.type && (item.type.trim().toLowerCase() === 'dbschemajson' || item.type.trim().toLowerCase() === 'sql')) {
        item.directory = item.directory.split('/').slice(1).join('/');
      }
    });
  }
  if (configJson.commands) {
    configJson.commands = configJson.commands.filter(
      (item) =>
        !item.workingDirectory ||
        (!item.workingDirectory.trim().toLowerCase().includes('../mjcoreentities') &&
          !item.workingDirectory.trim().toLowerCase().includes('../mjserver') &&
          !item.workingDirectory.trim().toLowerCase().includes('../angular/core-entity-forms'))
    ); // remove this as we don't want people using MJ to ever generated this stuff.
  }
  if (configJson.customSQLScripts) {
    // find the one that has ../../SQL Scripts/MJ_BASE_BEFORE_SQL.sql and remove one level of the directory
    const mjBaseBeforeSQL = configJson.customSQLScripts.find((item) => item.scriptFile === '../../SQL Scripts/MJ_BASE_BEFORE_SQL.sql');
    if (mjBaseBeforeSQL) {
      mjBaseBeforeSQL.scriptFile = mjBaseBeforeSQL.scriptFile.split('/').slice(1).join('/');
    }
  }

  archive.append(JSON.stringify(configJson, null, 2), { name: configFileOutputPath });
}

async function handleMJExplorerDirectory(dir, normalizedDir, archive) {
  console.log(`   Handling MJ Explorer directory...`);
  const configFilePath = `${dir}/angular.json`;
  const configFileOutputPath = `${normalizedDir}/angular.json`;
  const configFileContent = fs.readFileSync(configFilePath, 'utf8');
  const configJson = JSON.parse(configFileContent);
  const assets = configJson.projects?.MJExplorer?.architect?.build?.options?.assets;
  if (assets) {
    // in this node of the json, we need to find an object within the array that includes the string 'node_modules/@progress/kendo-theme-default' within a
    // property called "input"
    const kendoThemeDefault = assets.find((item) => item.input?.includes('node_modules/@progress/kendo-theme-default'));
    if (kendoThemeDefault) {
      // found the object, now we need to update the input property to remove anything that precedes node_modules
      // find where node_modules is and remove everything before it
      // this is because we are using an npm workspace and the path to node_modules is different for people who are working outside of a workspace
      const nodeModulesIndex = kendoThemeDefault.input.indexOf('node_modules');
      kendoThemeDefault.input = kendoThemeDefault.input.substring(nodeModulesIndex);
    }
  }
  archive.append(JSON.stringify(configJson, null, 2), { name: configFileOutputPath });

  // now handle the environment files (environment.ts, environment.development.ts, environment.staging.ts)
  await handleSingleEnvironmentFile(dir, normalizedDir, archive, 'src/environments/', 'environment.ts', false);
  await handleSingleEnvironmentFile(dir, normalizedDir, archive, 'src/environments/', 'environment.development.ts', true);
  await handleSingleEnvironmentFile(dir, normalizedDir, archive, 'src/environments/', 'environment.staging.ts', false);
}

async function handleSingleEnvironmentFile(dir, normalizedDir, archive, subDir, fileName, isDevelopment) {
  const filePath = path.join(dir, subDir, fileName);
  let fileContent = fs.readFileSync(filePath, 'utf8');

  // Clear values for sensitive keys in the environment configuration
  fileContent = clearSensitiveAngularEnvironmentValues(fileContent, isDevelopment);

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
        'install/*.sql.old',
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
  const directories = ['SQL Scripts', 'packages/CodeGen', 'packages/MJAPI', 'packages/MJExplorer', 'packages/GeneratedEntities'];
  const filename = `Distributions/MemberJunction_Code_Bootstrap_${dateTime}.zip`;
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
      // For everything else, we do the general approach but in some cases we pre-process the files for CodeGen/MJExplorer
      if (normalizedDir === 'CodeGen') {
        await handleCodeGenDirectory(dir, normalizedDir, archive);
      } else if (normalizedDir === 'MJExplorer') {
        await handleMJExplorerDirectory(dir, normalizedDir, archive);
      }

      const gitignore = fs.readFileSync('.gitignore').toString();

      // General Approach Here
      archive.glob(
        `**/*`,
        {
          cwd: dir,
          ignore: [
            ...gitignore.split('\n').filter((l) => !l.trimStart().startsWith('#')),
            'node_modules/**',
            'dist/**',
            '.vscode/**',
            '.angular/**',
            'internal_only/**',
            'package-lock.json',
            '.env',
            '*.output.txt',
            '.*', // This will ignore all files that start with a dot
            normalizedDir === 'CodeGen' ? 'config.json' : '', // Ignore the original config.json when adding files from CodeGen
            normalizedDir === 'MJExplorer' ? 'angular.json' : '', // Ignore the original angular.json when adding files from MJExplorer
            normalizedDir === 'MJExplorer' ? 'src/environments/**' : '', // Ignore the original envrioment files when adding files from MJExplorer
            normalizedDir === 'MJExplorer' ? 'kendo-ui-license.txt' : '', // Don't want to include this!
            normalizedDir === 'MJExplorer' ? 'src/app/generated/**' : '', // Don't want to include any of the generated stuff
            normalizedDir === 'GeneratedEntities' ? 'src/generated/**' : '', // Don't want to include any of the generated stuff
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

  // Finalize the archive
  console.log('Finalizing creation of zip file...');
  await archive.finalize();
  console.log('Zip file created successfully.');
  console.log(`File name: ${filename}`);
  fs.writeFileSync('CreateMJDistribution.log', filename);
}

// Execute the function
createMJDistribution();
