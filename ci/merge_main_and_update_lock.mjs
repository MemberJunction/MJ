import { simpleGit } from 'simple-git';
import { execSync } from 'child_process';
import fs from 'fs';

const git = simpleGit();

// First, do the merge
console.log('Fetching and merging main branch...');
await git.fetch('origin', 'main');
await git.merge(['-X', 'theirs', 'origin/main']);

// Update package-lock.json with new versions
console.log('\nUpdating package-lock.json with new package versions...');
try {
  // Run npm install with package-lock-only flag
  execSync('npm install --package-lock-only', { stdio: 'inherit' });
  
  // Check if package-lock.json was modified
  const status = await git.status();
  const lockFileModified = status.modified.includes('package-lock.json') || 
                          status.not_added.includes('package-lock.json');
  
  if (lockFileModified) {
    console.log('package-lock.json has been updated with new versions');
    
    // Get the version from package.json for commit message
    const packageJson = JSON.parse(fs.readFileSync('packages/MJCore/package.json', 'utf8'));
    const version = packageJson.version;
    
    // Stage and commit the lock file
    await git.add('package-lock.json');
    await git.commit(`chore: Update package-lock.json with v${version} dependencies

Updates @memberjunction/* package versions in lock file after publishing v${version}`);
    
    console.log('Committed package-lock.json updates');
  } else {
    console.log('No changes to package-lock.json needed');
  }
} catch (error) {
  console.error('Error updating package-lock.json:', error);
  // Don't fail the entire process if lock file update fails
  console.log('Continuing despite package-lock.json update error...');
}

// Push everything to next
console.log('\nPushing to origin/next...');
await git.push('origin', 'HEAD:next');

console.log('Successfully merged main and updated package-lock.json in next branch');