const os = require('os');
const { spawn } = require('child_process');
const readline = require('readline');
const { execSync } = require('child_process');
const fs = require('fs');
const fsSync = require('fs/promises');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function askQuestion(query, defaultValue = '') {
    return new Promise((resolve) => {
        const defaultStr = defaultValue ? ` (Default: ${defaultValue})` : '';
      rl.question(`${query} ${defaultStr} `, (answer) => {
        resolve(answer && answer.length > 0 ? answer : defaultValue);
      });
    });
}

const prerequisites = [
  {name: 'Node.js', command: 'node -v'},
  {name: 'npm', command: 'npm -v'},
  {name: 'TypeScript', command: 'tsc -v'},
  {name: 'Angular CLI', command: 'ng version'}
];
function checkPrerequisites() {
  console.log(`Checking ${prerequisites.length} prerequisites...`);
  for (const prerequisite of prerequisites) {
    checkSinglePrerequisite(prerequisite.name, prerequisite.command);
  }
}

function checkSinglePrerequisite(name, command) {
  try {
    execSync(command, { stdio: 'ignore' });
    console.log(`   ${name} is installed.`);
  } catch (error) {
    console.error(`   Missing prerequisite: ${name}. Please make sure ${prerequisites.map(prerequisite => prerequisite.name).join(', ')} are all installed before attempting to setup MemberJunction.`);
    process.exit(1);
  }
}



async function main() {
  // Questions for .env and config.json
  checkPrerequisites();
  if (!checkAvailableDiskSpace(2)) {
    process.exit(1);
  }

  console.log("Setting up MemberJunction Distribution...");
  const {
    dbUrl,
    dbInstance,
    dbTrustServerCertificate,
    dbDatabase,
    dbPort,
    codeGenLogin,
    codeGenPwD,
    mjAPILogin,
    mjAPIPwD,
    graphQLPort,
    authType,
    msalWebClientId,
    msalTenantId,
    auth0ClientId,
    auth0ClientSecret,
    auth0Domain,
    createNewUser,
    userName,
    userFirstName,
    userLastName,
    userEmail,
    openAIAPIKey,
    anthropicAPIKey,
    mistralAPIKey
  } = await getUserConfigurationInput();

  // if the user asked for a new user via our config file, need to push that info down to the CodeGen config.json file
  if (createNewUser?.trim().toUpperCase() === 'Y') {
    console.log('   Setting up config.json...');
    await updateConfigNewUserSetup(path.join(process.cwd(),'CodeGen'), userName, userFirstName, userLastName, userEmail);  
  }

  // Process GeneratedEntities
  console.log('\nBootstrapping GeneratedEntities...');
  process.chdir('GeneratedEntities');
  console.log('Running npm install...');
  execSync('npm install', { stdio: 'inherit' });
  process.chdir('..');

  // Process CodeGen
  console.log('\nProcessing CodeGen...');
  process.chdir('CodeGen');
  console.log('   Updating ')
  console.log('   Setting up .env and config.json...');
  const codeGenENV = `#Database Setup
DB_HOST='${dbUrl}'
DB_PORT=${dbPort}
DB_USERNAME='${codeGenLogin}'
DB_PASSWORD='${codeGenPwD}'
DB_DATABASE='${dbDatabase}'
${dbInstance && dbInstance.length > 0 ? 'DB_INSTANCE_NAME=\'' + dbInstance + '\'' : ''}
${dbTrustServerCertificate && dbTrustServerCertificate.trim().toUpperCase() === 'Y' ? 'DB_TRUST_SERVER_CERTIFICATE=1' : ''}

#OUTPUT CODE is used for output directories like SQL Scripts
OUTPUT_CODE='${dbDatabase}'

# Name of the schema that MJ has been setup in. This defaults to __mj
MJ_CORE_SCHEMA='__mj'

# If using Advanced Generation, populate this with the API key for the AI vendor you are using
# Also, you need to configure the settings under advancedGeneration in the config.json file, including choosing the vendor.
AI_VENDOR_API_KEY__OpenAILLM='${openAIAPIKey}'  
AI_VENDOR_API_KEY__MistralLLM='${mistralAPIKey}'  
AI_VENDOR_API_KEY__AnthropicLLM='${anthropicAPIKey}'  

#CONFIG_FILE is the name of the file that has the configuration parameters for CodeGen
CONFIG_FILE='config.json'
  `
  fs.writeFileSync('.env', codeGenENV);

  
  console.log('   Running npm install...');
  execSync('npm install', { stdio: 'inherit' });

  console.log('   Running npm link for GeneratedEntities...');
  execSync('npm link ../GeneratedEntities', { stdio: 'inherit' });



  //*******************************************************************
  // Process MJAPI
  //*******************************************************************
  process.chdir('..');
  console.log('\n\nBootstrapping MJAPI...');
  process.chdir('MJAPI');
  console.log('   Running npm install...');
  execSync('npm install', { stdio: 'inherit' });
  console.log('   Setting up MJAPI .env file...');
  const mjAPIENV = `#Database Setup
DB_HOST='${dbUrl}'
DB_PORT=${dbPort}
DB_USERNAME='${mjAPILogin}'
DB_PASSWORD='${mjAPIPwD}'
DB_DATABASE='${dbDatabase}'
${dbInstance && dbInstance.length > 0 ? 'DB_INSTANCE_NAME=\'' + dbInstance + '\'' : ''}
${dbTrustServerCertificate && dbTrustServerCertificate.trim().toUpperCase() === 'Y' ? 'DB_TRUST_SERVER_CERTIFICATE=1' : ''}

PORT=${graphQLPort}

UPDATE_USER_CACHE_WHEN_NOT_FOUND=1
UPDATE_USER_CACHE_WHEN_NOT_FOUND_DELAY=5000

# AUTHENTICATION SECTION - you can use MSAL or Auth0 or both for authentication services for MJAPI
# MSAL Section 
WEB_CLIENT_ID=${msalWebClientId}
TENANT_ID=${msalTenantId}

# Auth0 Section
AUTH0_CLIENT_ID=${auth0ClientId}
AUTH0_CLIENT_SECRET=${auth0ClientSecret}
AUTH0_DOMAIN=${auth0Domain}

# Name of the schema that MJ has been setup in. This defaults to __mj
MJ_CORE_SCHEMA='__mj'

# If you are using MJAI library, provide your API KEYS here for the various services
# Format is AI_VENDOR_API_KEY__<DriverClass> Where DriverClass is the DriverClass field from the AI Models Entity in MemberJunction
AI_VENDOR_API_KEY__OpenAILLM = '${openAIAPIKey}'
AI_VENDOR_API_KEY__AnthropicLLM = '${anthropicAPIKey}'
AI_VENDOR_API_KEY__MistralLLM = '${mistralAPIKey}'

# Skip API URL, KEY and Org ID
# YOU MUST ENTER IN THE CORRECT URL and ORG ID for your Skip API USE BELOW
ASK_SKIP_API_URL = 'http://localhost:8000'
ASK_SKIP_ORGANIZATION_ID = 1

CONFIG_FILE='config.json'
`
  fs.writeFileSync('.env', mjAPIENV);
  console.log('   Running npm link for GeneratedEntities...');
  execSync('npm link ../GeneratedEntities', { stdio: 'inherit' });
  process.chdir('..');

  console.log('Running CodeGen...');
  process.chdir('CodeGen');

  renameFolderToMJ_BASE(dbDatabase);

  // next, run CodeGen
  // We do not manually run the compilation for GeneratedEntities because CodeGen handles that, but notice above that we did npm install for GeneratedEntities otherwise when COdeGen attempts to compile it, it will fail.
  execSync('npx ts-node-dev src/index.ts', { stdio: 'inherit' });
  process.chdir('..');

  // Process MJExplorer
  console.log('\nProcessing MJExplorer...');
  process.chdir('MJExplorer');

  console.log('\n   Updating environment files...');
  const config = {
    CLIENT_ID: msalWebClientId,
    TENANT_ID: msalTenantId,
    CLIENT_AUTHORITY: msalTenantId ? 'https://login.microsoftonline.com/' + msalTenantId : '',
    AUTH0_DOMAIN: auth0Domain,
    AUTH0_CLIENTID: auth0ClientId
  };

  await updateEnvironmentFiles(process.cwd(), config);

  // keep on going with MJ Explorer - do the rest of the stuff
  console.log('   Running npm install...');
  execSync('npm install', { stdio: 'inherit' });
  console.log('   Running npm link for GeneratedEntities...');
  execSync('npm link ../GeneratedEntities', { stdio: 'inherit' });
  process.chdir('..');
  
  // Close readline interface
  rl.close();
}

main().catch((error) => {
  console.error('An error occurred:', error);
});

function renameFolderToMJ_BASE(dbDatabase) {
    // rename the MJ_BASE set of SQL Scripts to our new dbname
    try {
      // Define the old and new folder paths
      const oldFolderPath = path.join(__dirname, 'SQL Scripts', 'generated', 'MJ_BASE');
      const newFolderPath = path.join(__dirname, 'SQL Scripts', 'generated', dbDatabase); // Assuming dbDatabase holds the new name
    
      //check if the new Direcotry exists
      const isNewFolderExists = fs.existsSync(newFolderPath);
      if (!isNewFolderExists) {
        fs.mkdirSync(newFolderPath);
      }
      const files = fs.readdirSync(oldFolderPath);
      files.forEach((file) => {
        const sourceFile = path.join(oldFolderPath, file);
        const destFile = path.join(newFolderPath, file);
        fs.renameSync(sourceFile, destFile);
      });
      fs.rmdirSync(oldFolderPath);
  
      console.log('Renamed SQL Scripts/generated/MJ_BASE to SQL Scripts/generated/' + dbDatabase + ' successfully.');
    } catch (err) {
      console.error('An error occurred while renaming the SQL Scripts/generated/MJ_BASE folder:', err);
    }
}

/**
 * Updates environment files in a given directory.
 * @param {string} dirPath - The path to the directory containing environment files.
 * @param {object} config - The configuration object with values to update.
 */
async function updateEnvironmentFiles(dirPath, config) {
  try {
    // Define the pattern for environment files.
    const envFilePattern = /environment.*\.ts$/;

    // Read all files in the directory.
    const files = await fsSync.readdir(dirPath);

    // Filter for environment files.
    const envFiles = files.filter(file => envFilePattern.test(file));

    // Update each environment file.
    for (const file of envFiles) {
      const filePath = path.join(dirPath, file);
      const data = await fsSync.readFile(filePath, 'utf8');

      // Replace the values in the file.
      let updatedData = data;
      Object.keys(config).forEach(key => {
        const regex = new RegExp(`${key}:\\s*'.*?'`, 'g');
        updatedData = updatedData.replace(regex, `${key}: '${config[key]}'`);
      });

      // Write the updated data back to the file.
      await fsSync.writeFile(filePath, updatedData, 'utf8');
      console.log(`Updated ${file}`);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

/**
 * Updates newUserSetup in the config.json file.
 * @param {string} dirPath - The path to the directory containing the config.json file.
 * @param {string} userName - The new UserName to set.
 * @param {string} firstName - The new FirstName to set.
 * @param {string} lastName - The new LastName to set.
 * @param {string} email - The new Email to set.
 */
async function updateConfigNewUserSetup(dirPath, userName, firstName, lastName, email) {
  try {
    const configFilePath = path.join(dirPath, 'config.json');

    // Read the config.json file
    const data = await fsSync.readFile(configFilePath, 'utf8');
    const config = JSON.parse(data);

    // Update the newUserSetup object
    if (!config.newUserSetup) config.newUserSetup = { };
    
    config.newUserSetup.UserName = userName;
    config.newUserSetup.FirstName = firstName;
    config.newUserSetup.LastName = lastName;
    config.newUserSetup.Email = email;

    // Write the updated configuration back to config.json
    await fsSync.writeFile(configFilePath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`      Updated config.json in ${dirPath}`);
  } catch (err) {
    console.error('Error:', err);
  }
}


// Function to check if there's at least 2GB of free disk space
function checkAvailableDiskSpace(numGB = 2) {
  try {
      console.log(`Checking for at least ${numGB}GB of free disk space...`)
      // Define numGB GB in bytes
      const GBToBytes = 1024 * 1024 * 1024;
      const requiredSpace = numGB * GBToBytes;
      let freeSpace;

      if (os.platform() === 'win32') {
          // For Windows, check the C: drive
          const command = `wmic LogicalDisk where DeviceID="C:" get FreeSpace`;
          const output = execSync(command).toString();
          const lines = output.trim().split('\n');
          freeSpace = parseInt(lines[1].trim());
      } else {
          // For Unix-like systems, check the root directory
          const command = `df -k --output=avail / | tail -1`;
          freeSpace = parseInt(execSync(command).toString().trim()) * 1024;
      }

      if (freeSpace >= requiredSpace) {
          console.log(`   Sufficient disk space available: ${freeSpace / GBToBytes} GB`);
          return true;
      } else {
          console.error(`   Insufficient disk space. Required: ${requiredSpace} bytes, Available: ${freeSpace / GBToBytes} GB`);
          return false;
      }
  } catch (error) {
      console.error('   Error checking disk space:', error);
      return false;
  }
}


async function getUserConfigurationInput(fileName = 'install.config.json') {
  console.log(`Loading configuration settings from ${fileName}...`);
  const configFile = path.join(__dirname, fileName);
  let config = {};

  // Check if the configuration file exists
  if (fs.existsSync(configFile)) {
      config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

      // If the first question's answer (dbUrl) is empty, assume the user needs to provide input
      if (!config.dbUrl) {
          console.log(`${fileName} found but dbUrl is empty. Asking configuration questions. [Fill out ${fileName} to skip this step in the future]`);
          config = await askConfigurationQuestions();
      }
  } else {
      console.log(`${fileName} not found. Asking configuration questions.`);
      config = await askConfigurationQuestions();
  }

  return config;
}

async function askConfigurationQuestions() {
    // ... Your existing questions here ...
    // Return an object with all the configuration values
    console.log(">>> Please answer the following questions to setup the .env files for CodeGen. After this process you can manually edit the .env file in CodeGen as desired.");
    const dbUrl = await askQuestion('Enter the database server URL: ');
    const dbInstance = await askQuestion('If you are using a named instance on that server, if so, enter the name here, if not leave blank: ');
    const dbTrustServerCertificate = await askQuestion('Does the database server use a self-signed certificate? If you are using a local instance, enter Y: ', 'N');
    const dbDatabase = await askQuestion('Enter the database name on that server: ');
    const dbPort = await askQuestion('Enter the port the database server listens on: ', 1433);
    const codeGenLogin = await askQuestion('Enter the database login for CodeGen: ');
    const codeGenPwD = await askQuestion('Enter the database password for CodeGen: ');
    console.log(">>> Please answer the following questions to setup the .env files for MJAPI. After this process you can manually edit the .env file in CodeGen as desired.");
    const mjAPILogin = await askQuestion('Enter the database login for MJAPI: ');
    const mjAPIPwD = await askQuestion('Enter the database password for MJAPI: ');
    const graphQLPort = await askQuestion('Enter the port to use for the GraphQL API: ', 4000);
    const authType = await askQuestion('Will you be using MSAL or Auth0 or both for authentication services for MJAPI?: ', 'MSAL');
    let msalWebClientId='', msalTenantId='', auth0ClientId='', auth0ClientSecret='', auth0Domain='';
    if (authType?.trim().toUpperCase() === 'MSAL' || authType?.trim().toUpperCase() === 'BOTH') {
      msalWebClientId = await askQuestion('   Enter the web client ID for MSAL: ');
      msalTenantId = await askQuestion('   Enter the tenant ID for MSAL: ');
    }
    if (authType?.trim().toUpperCase() === 'AUTH0' || authType?.trim().toUpperCase() === 'BOTH') {
      auth0ClientId = await askQuestion('   Enter the client ID for Auth0: ');
      auth0ClientSecret = await askQuestion('   Enter the client secret for Auth0: ');
      auth0Domain = await askQuestion('   Enter the domain for Auth0: ');
    }  
    const createNewUser = await askQuestion('Do you want to create a new user in the database? (Y/N): ', 'Y');
    let userName='', userFirstName='', userLastName='', userEmail='';
    if (createNewUser?.trim().toUpperCase() === 'Y') {
      userEmail = await askQuestion('   Enter the new user email: ');
      userFirstName = await askQuestion('   Enter the new user first name: ');
      userLastName = await askQuestion('   Enter the new user last name: ');
      userName = await askQuestion('   Enter the new user name (leave blank to use email): ', userEmail);
    }
    const openAIAPIKey = await askQuestion('Enter the OpenAI API Key (leave blank if not using): ', '');
    const anthropicAPIKey = await askQuestion('Enter the Anthropic API Key (leave blank if not using): ', '');
    const mistralAPIKey = await askQuestion('Enter the Mistral API Key (leave blank if not using): ', '');

    return {
      dbUrl,
      dbInstance,
      dbTrustServerCertificate,
      dbDatabase,
      dbPort,
      codeGenLogin,
      codeGenPwD,
      mjAPILogin,
      mjAPIPwD,
      graphQLPort,
      authType,
      msalWebClientId,
      msalTenantId,
      auth0ClientId,
      auth0ClientSecret,
      auth0Domain,
      createNewUser,
      userName,
      userFirstName,
      userLastName,
      userEmail,
      openAIAPIKey,
      anthropicAPIKey,
      mistralAPIKey
    };
}

 