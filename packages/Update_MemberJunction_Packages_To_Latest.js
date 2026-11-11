const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline-sync');

// Function to get MemberJunction dependencies from package.json in a given directory
function getMemberJunctionDependencies(directoryPath) {
    const packageJsonPath = path.join(directoryPath, 'package.json');
    let dependenciesArray = [];

    if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const dependencies = Object.keys(packageJson.dependencies || {});
        const devDependencies = Object.keys(packageJson.devDependencies || {});
        const peerDependencies = Object.keys(packageJson.peerDependencies || {});

        const allDependencies = [...dependencies, ...devDependencies, ...peerDependencies];
        const filteredDependencies = allDependencies.filter(dep => dep.startsWith('@memberjunction/'));

        filteredDependencies.forEach(dep => {
            dependenciesArray.push(dep.replace('@memberjunction/', ''));
        });
    }
    return dependenciesArray;
}

// Function to get sub-directories that contain a package.json file
function getSubDirectoriesWithPackageJson() {
    const subDirectories = fs.readdirSync('.', { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
        .map(dirent => ({ Name: dirent.name }))
        .filter(dir => fs.existsSync(path.join(dir.Name, 'package.json')));

    return subDirectories;
}

// Function to install latest versions of given dependencies
function installLatestVersions(dependencies) {
    const npmCommand = `npm install ${dependencies.map(dep => `@memberjunction/${dep}@latest`).join(' ')} --save`;
    execSync(npmCommand, { stdio: 'inherit' });
}

// Main script execution starts here
console.log("Starting to update MemberJunction dependencies...");
const projects = getSubDirectoriesWithPackageJson();
console.log(`Found ${projects.length} projects to check for MemberJunction dependencies`);

projects.forEach(projObject => {
    const proj = projObject.Name;
    process.chdir(proj);
    const mjDependencies = getMemberJunctionDependencies('.');
    if (mjDependencies.length === 0) {
        console.log(`   >>>   No MemberJunction dependencies found in ${proj}, skipping...`);
    } else {
        console.log(`   >>>   Found ${mjDependencies.length} MemberJunction dependencies in ${proj}`);
        installLatestVersions(mjDependencies);
    }
    process.chdir('..');
});

const buildGeneratedEntities = readline.question("After the packages are updated, do you want to build GeneratedEntities? (y/n) ");
if (buildGeneratedEntities.toLowerCase() === 'y') {
    console.log("Building GeneratedEntities");
    process.chdir('GeneratedEntities');
    execSync('npm run build', { stdio: 'inherit' });
    process.chdir('..');
}