createMJDistribution();
async function createMJDistribution() {
  console.log('Starting the process of creating a distribution zip file for MemberJunction...')

  const fs = require('fs-extra');
  const archiver = require('archiver');
  
  // Get the current date and time in the desired format using native JavaScript
  const now = new Date();
  const dateTime = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}`;
  
  // Define directories and output
  const directories = ['SQL Scripts', 'packages/CodeGen', 'packages/MJAPI', 'packages/MJExplorer', 'packages/GeneratedEntities'];
  const output = fs.createWriteStream(`Distributions/MemberJunction_Code_Bootstrap_${dateTime}.zip`);
  const archive = archiver('zip');
  
  console.log('Creating zip file...')
  // Pipe archive data to the output file
  archive.pipe(output);
  
  // Add directories to zip
  directories.forEach((dir) => {
    console.log(`Adding ${dir} to zip file...`);
    const normalizedDir = dir.replace('packages/', '');
  
    if (normalizedDir === 'CodeGen') {
      const configFilePath = `${dir}/config.json`;
      const configFileOutputPath = `${normalizedDir}/config.json`;
      const configFileContent = fs.readFileSync(configFilePath, 'utf8');
      const configJson = JSON.parse(configFileContent);
  
  
      
      if (configJson.output) {
        configJson.output = configJson.output.filter(item =>  item.type && 
                                                              item.type.trim().toLowerCase() !== 'coreentitysubclasses' &&
                                                              item.type.trim().toLowerCase() !== 'graphqlcoreentityresolvers' &&
                                                              item.type.trim().toLowerCase() !== 'angularcoreentities' ); // remove these as we don't want people using MJ to ever generated this stuff.
  
        // next up, we add "__mj" to the list of exclude schemas as we don't want people using MJ to ever generate stuff in the __mj schema.
        // Add "__mj" to the "excludeSchemas" array
        if (configJson.excludeSchemas) {
          configJson.excludeSchemas.push("__mj");
        } 
        else {
          configJson.excludeSchemas = ["__mj"];
        }
  
        // next up, we need to remove one level of directory from output path if our type = DBSchemaJSON or type = SQL
        configJson.output.forEach(item => {
          if (item.type && (item.type.trim().toLowerCase() === 'dbschemajson' || item.type.trim().toLowerCase() === 'sql')) {
            item.directory = item.directory.split('/').slice(1).join('/');
          }
        });
      }
      if (configJson.commands) {
        configJson.commands = configJson.commands.filter(item => !item.workingDirectory || 
                                                                            (    !item.workingDirectory.trim().toLowerCase().includes('../mjcoreentities')
                                                                              && !item.workingDirectory.trim().toLowerCase().includes('../mjserver')) ); // remove this as we don't want people using MJ to ever generated this stuff.
      }
      if (configJson.customSQLScripts) {
        // find the one that has ../../SQL Scripts/MJ_BASE_BEFORE_SQL.sql and remove one level of the directory
        const mjBaseBeforeSQL = configJson.customSQLScripts.find(item => item.scriptFile === '../../SQL Scripts/MJ_BASE_BEFORE_SQL.sql');
        if (mjBaseBeforeSQL) {
          mjBaseBeforeSQL.scriptFile = mjBaseBeforeSQL.scriptFile.split('/').slice(1).join('/');
        }
      }
  
      archive.append(JSON.stringify(configJson, null, 2), { name: configFileOutputPath });
    }
    else if (normalizedDir === 'MJExplorer') {
      const configFilePath = `${dir}/angular.json`;
      const configFileOutputPath = `${normalizedDir}/angular.json`;
      const configFileContent = fs.readFileSync(configFilePath, 'utf8');
      const configJson = JSON.parse(configFileContent);
      const assets = configJson.projects?.MJExplorer?.architect?.build?.options?.assets;
      if (assets) {
        // in this node of the json, we need to find an object within the array that includes the string 'node_modules/@progress/kendo-theme-default' within a 
        // property called "input"
        const kendoThemeDefault = assets.find(item => item.input?.includes('node_modules/@progress/kendo-theme-default'));
        if (kendoThemeDefault) {
          // found the object, now we need to update the input property to remove anything that precedes node_modules
          // find where node_modules is and remove everything before it
          const nodeModulesIndex = kendoThemeDefault.input.indexOf('node_modules');
          kendoThemeDefault.input = kendoThemeDefault.input.substring(nodeModulesIndex);
        }
      }
      archive.append(JSON.stringify(configJson, null, 2), { name: configFileOutputPath });
    }
    
    archive.glob(`**/*`, {
      cwd: dir,
      ignore: [
        'node_modules/**',
        'dist/**',
        '.vscode/**',
        '.angular/**',
        'internal_only/**',
        'package-lock.json',
        '.env',
        'install/*.sql.old',
        '*.output.txt',
        '.*', // This will ignore all files that start with a dot
        normalizedDir === 'CodeGen' ? 'config.json' : '', // Ignore the original config.json when adding files from CodeGen
        normalizedDir === 'MJExplorer' ? 'angular.json' : '' // Ignore the original angular.json when adding files from MJExplorer
      ],
    }, { prefix: normalizedDir });
  });
  
  // Add Update_MemberJunction_Packages_To_Latest.ps1 to the root of the zip
  console.log('Adding Update_MemberJunction_Packages_To_Latest.ps1 to zip file...')
  const latestVersionScriptContent = fs.readFileSync('packages/Update_MemberJunction_Packages_To_Latest.ps1', 'utf8');
  archive.append(latestVersionScriptContent, { name: 'Update_MemberJunction_Packages_To_Latest.ps1' });
  
  // Add InstallMJDistribution.js to the root of the zip
  console.log('Adding InstallMJ.js to zip file...')
  const installScriptContent = fs.readFileSync('InstallMJ.js', 'utf8');
  archive.append(installScriptContent, { name: 'InstallMJ.js' });

  // Add the template for teh install.config.json to the root of the zip
  console.log('Adding install.config.json to zip file...')
  const installConfigJson = fs.readFileSync('install.config.json', 'utf8');
  archive.append(installConfigJson, { name: 'install.config.json' });
  
  // Finalize the archive
  console.log('Finalizing creation of zip file...')
  await archive.finalize();
  console.log('Zip file created successfully.')
}