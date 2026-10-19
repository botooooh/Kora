const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const staging = path.join(process.env.TEMP, 'Kora-Zip-Staging');
if (fs.existsSync(staging)) {
  fs.rmSync(staging, { recursive: true, force: true });
}
fs.mkdirSync(staging, { recursive: true });

const filesToInclude = [
  'Installer-Kora.cmd',
  'Desinstaller-Kora.cmd',
  'install.ps1',
  'uninstall.ps1',
  'package.json',
  'main.js',
  'preload.js',
  'index.html',
  'styles.css',
  'renderer.js',
  'NusaBridge.cs',
  'KoraLauncher.cs',
  'kora-logo.png',
  'kora.ico'
];

filesToInclude.forEach(f => {
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, path.join(staging, f));
  }
});

const zipWeb = path.resolve('website/downloads/Kora-Windows.zip');
const zipDocs = path.resolve('docs/downloads/Kora-Windows.zip');
if (fs.existsSync(zipWeb)) fs.unlinkSync(zipWeb);
if (fs.existsSync(zipDocs)) fs.unlinkSync(zipDocs);

// Zip using PowerShell Compress-Archive command via execSync cleanly
execSync(`powershell.exe -NoProfile -Command "Compress-Archive -Path '${staging}\\*' -DestinationPath '${zipWeb}' -CompressionLevel Optimal -Force"`);
fs.copyFileSync(zipWeb, zipDocs);

// Mirror live update files for OTA hosting
const mirrorDirs = [path.resolve('website/update'), path.resolve('docs/update')];
mirrorDirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  filesToInclude.forEach(f => {
    if (fs.existsSync(f)) {
      fs.copyFileSync(f, path.join(dir, f));
    }
  });
});

fs.rmSync(staging, { recursive: true, force: true });

// Also update the user's Downloads folder
const userHome = process.env.USERPROFILE;
const userDownloadsZip = path.join(userHome, 'Downloads', 'Kora-Windows.zip');
const userDownloadsDir = path.join(userHome, 'Downloads', 'Kora-Windows');
try {
  fs.copyFileSync(zipWeb, userDownloadsZip);
  if (fs.existsSync(userDownloadsDir)) {
    filesToInclude.forEach(f => {
      if (fs.existsSync(f)) {
        fs.copyFileSync(f, path.join(userDownloadsDir, f));
      }
    });
  }
} catch (e) {
  console.error('Error updating downloads:', e);
}

console.log('Zip built successfully and user downloads updated!');
