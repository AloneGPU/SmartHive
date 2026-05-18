$ErrorActionPreference = 'Stop'

try {
  node --version | Out-Null
} catch {
  Write-Error 'Node.js not found. Please install Node.js first.'
  exit 1
}

npm install --legacy-peer-deps
npm run build
npm run build:server
Write-Host 'DONE: dist and dist-server updated.' -ForegroundColor Green
