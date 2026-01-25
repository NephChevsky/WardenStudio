// Security Check Script
// Run this to verify your environment is properly configured
// Usage: node security-check.js

const fs = require('fs');
const path = require('path');

console.log('🔒 Warden Studio Security Check\n');

let hasIssues = false;

// Check 1: .env file exists
console.log('1. Checking for .env file...');
if (fs.existsSync('.env')) {
  console.log('   ✅ .env file exists');
  
  // Read .env content
  const envContent = fs.readFileSync('.env', 'utf8');
  
  // Check for required variables
  console.log('\n2. Checking required environment variables...');
  
  if (envContent.includes('VITE_TWITCH_CLIENT_ID=') && 
      !envContent.includes('VITE_TWITCH_CLIENT_ID=your_client_id_here')) {
    console.log('   ✅ VITE_TWITCH_CLIENT_ID is set');
  } else {
    console.log('   ❌ VITE_TWITCH_CLIENT_ID is not configured');
    console.log('      → Get your Client ID from https://dev.twitch.tv/console/apps');
    hasIssues = true;
  }
  
  // Note: VITE_ENCRYPTION_KEY is no longer required!
  // Encryption keys are now managed securely by the OS keychain
  if (envContent.includes('VITE_ENCRYPTION_KEY=')) {
    console.log('   ℹ️  VITE_ENCRYPTION_KEY found in .env (no longer needed)');
    console.log('      → The app now uses OS-level keychain for encryption keys');
    console.log('      → You can safely remove this from .env');
  } else {
    console.log('   ✅ No VITE_ENCRYPTION_KEY in .env (using OS keychain instead)');
  }
  
  // Check for placeholder values
  if (envContent.includes('your_client_id_here')) {
    console.log('\n   ⚠️  WARNING: Placeholder values detected in .env');
    console.log('      Replace them with actual values before running the app');
    hasIssues = true;
  }
  
} else {
  console.log('   ❌ .env file not found');
  console.log('      → Copy .env.example to .env: Copy-Item .env.example .env');
  hasIssues = true;
}

// Check 2: .gitignore contains .env
console.log('\n3. Checking .gitignore...');
if (fs.existsSync('.gitignore')) {
  const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
  if (gitignoreContent.includes('.env')) {
    console.log('   ✅ .env is in .gitignore');
  } else {
    console.log('   ❌ .env is NOT in .gitignore - this is a security risk!');
    hasIssues = true;
  }
} else {
  console.log('   ❌ .gitignore not found');
  hasIssues = true;
}

// Check 3: Verify .env is not tracked by git
console.log('\n4. Checking git status of .env...');
try {
  const { execSync } = require('child_process');
  const gitStatus = execSync('git ls-files .env', { encoding: 'utf8' });
  
  if (gitStatus.trim() === '') {
    console.log('   ✅ .env is not tracked by git');
  } else {
    console.log('   ❌ CRITICAL: .env is tracked by git!');
    console.log('      → Run: git rm --cached .env');
    console.log('      → IMPORTANT: If you already pushed .env to GitHub, you must:');
    console.log('        1. Change your VITE_ENCRYPTION_KEY immediately');
    console.log('        2. Rotate your Twitch Client ID (create a new app)');
    console.log('        3. Consider the repository compromised');
    hasIssues = true;
  }
} catch (error) {
  console.log('   ⚠️  Could not check git status (not a git repo or git not installed)');
}

// Check 4: Verify build directories are gitignored
console.log('\n5. Checking build artifacts...');
const buildDirs = ['dist', 'dist-electron', 'release', 'node_modules'];
const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');

buildDirs.forEach(dir => {
  if (gitignoreContent.includes(dir)) {
    console.log(`   ✅ ${dir}/ is gitignored`);
  } else {
    console.log(`   ❌ ${dir}/ is NOT gitignored`);
    hasIssues = true;
  }
});

// Summary
console.log('\n' + '='.repeat(50));
if (hasIssues) {
  console.log('❌ SECURITY CHECK FAILED');
  console.log('\nPlease fix the issues above before running the app or committing code.');
  process.exit(1);
} else {
  console.log('✅ ALL SECURITY CHECKS PASSED');
  console.log('\nYour environment is properly configured!');
  process.exit(0);
}
