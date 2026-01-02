import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = __dirname;
const releaseDir = path.join(rootDir, 'release');
const backendDir = path.join(releaseDir, 'backend');
const frontendDir = path.join(releaseDir, 'frontend');

// Helper to copy file
const copyFile = (src, dest) => {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${src} to ${dest}`);
  } else {
    console.warn(`Warning: Source file ${src} does not exist.`);
  }
};

// Helper to copy directory
const copyDir = (src, dest) => {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
};

// Main function
const createPackage = async () => {
  console.log('Starting packaging process...');

  // 1. Clean/Create release directories
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
  }
  fs.mkdirSync(releaseDir);
  fs.mkdirSync(backendDir);
  // Frontend dir will be created by copyDir

  // 2. Copy Backend Files
  console.log('Copying backend files...');
  
  // Copy compiled server
  const serverSrc = path.join(rootDir, 'dist-server', 'server.js');
  const serverDest = path.join(backendDir, 'server.js');
  
  if (!fs.existsSync(serverSrc)) {
    console.error('Error: dist-server/server.js not found. Run "npm run build:server" first.');
    process.exit(1);
  }
  copyFile(serverSrc, serverDest);

  // Copy package.json
  copyFile(path.join(rootDir, 'package.json'), path.join(backendDir, 'package.json'));
  
  // Copy .env
  copyFile(path.join(rootDir, '.env'), path.join(backendDir, '.env'));

  // Copy DEPLOY_GUIDE.md
  copyFile(path.join(rootDir, 'DEPLOY_GUIDE.md'), path.join(releaseDir, '使用说明书_必读.md'));

  // 3. Create start.bat for Windows
  const batContent = `@echo off
echo Starting SmartHive Backend...

if exist node_modules (
    echo Dependencies already installed.
) else (
    echo Installing dependencies...
    call npm install --production
)

echo Starting server...
node server.js
pause
`;
  fs.writeFileSync(path.join(backendDir, 'start.bat'), batContent);
  console.log('Created start.bat');

  // 4. Create README.txt
  const readmeContent = `SmartHive Backend Release
=========================

How to run:
1. Ensure Node.js is installed on this machine.
2. Double-click 'start.bat'.
   - This will automatically install required dependencies (first time only).
   - Then it will start the server.

Configuration:
- Edit the '.env' file to change database settings or ports.
`;
  fs.writeFileSync(path.join(backendDir, 'README.txt'), readmeContent);
  console.log('Created README.txt');

  // 5. Copy Frontend Files (for later deployment)
  console.log('Copying frontend files...');
  const distDir = path.join(rootDir, 'dist');
  if (fs.existsSync(distDir)) {
      copyDir(distDir, frontendDir);
      console.log('Frontend build copied to release/frontend');
  } else {
      console.warn('Warning: dist/ folder not found. Run "npm run build" first.');
  }

  console.log('Packaging complete! Output directory: ./release');
};

createPackage();
