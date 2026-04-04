$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$userApp = Join-Path $root 'church-network-app'
$adminApp = Join-Path $root 'church-network-admin'
$hostingDir = Join-Path $root 'hosting'
$adminHostingDir = Join-Path $hostingDir 'admin'

Write-Host 'Preparing combined shareable build...'

if (Test-Path $hostingDir) {
  Remove-Item -Recurse -Force $hostingDir
}

New-Item -ItemType Directory -Path $hostingDir | Out-Null
New-Item -ItemType Directory -Path $adminHostingDir | Out-Null

Push-Location $userApp
try {
  Write-Host 'Exporting user app web build...'
  if (Test-Path (Join-Path $userApp 'dist')) {
    Remove-Item -Recurse -Force (Join-Path $userApp 'dist')
  }
  $env:CI = '1'
  npx.cmd expo export --platform web
} finally {
  Pop-Location
}

Push-Location $adminApp
try {
  Write-Host 'Building admin app for /admin route...'
  $env:VITE_BASE_PATH = '/admin/'
  npm.cmd run build
} finally {
  Remove-Item Env:VITE_BASE_PATH -ErrorAction SilentlyContinue
  Pop-Location
}

Write-Host 'Copying user app into hosting root...'
robocopy (Join-Path $userApp 'dist') $hostingDir /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) {
  throw "Unable to copy user app build into hosting root. Robocopy exit code: $LASTEXITCODE"
}

Write-Host 'Copying admin app into hosting/admin...'
robocopy (Join-Path $adminApp 'dist') $adminHostingDir /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) {
  throw "Unable to copy admin app build into hosting/admin. Robocopy exit code: $LASTEXITCODE"
}

Write-Host 'Combined shareable build is ready in the hosting folder.'
Write-Host 'User app path:'
Write-Host ("  " + $hostingDir)
Write-Host 'Admin app path:'
Write-Host ("  " + $adminHostingDir)
