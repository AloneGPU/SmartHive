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

$deployDir = 'deploy_temp'
if (Test-Path $deployDir) {
  Remove-Item -Path $deployDir -Recurse -Force
}
New-Item -ItemType Directory -Path $deployDir | Out-Null

Copy-Item -Path 'dist' -Destination $deployDir -Recurse
Copy-Item -Path 'dist-server' -Destination $deployDir -Recurse
Copy-Item -Path 'package.json' -Destination $deployDir
Copy-Item -Path '.env.example' -Destination $deployDir
Copy-Item -Path 'BAOTA_DEPLOYMENT_GUIDE.md' -Destination "$deployDir/README.md"

if (Test-Path 'deploy.zip') {
  Remove-Item -Path 'deploy.zip' -Force
}
Compress-Archive -Path "$deployDir/*" -DestinationPath 'deploy.zip'
Remove-Item -Path $deployDir -Recurse -Force

Write-Host 'DONE: deploy.zip generated.' -ForegroundColor Green
