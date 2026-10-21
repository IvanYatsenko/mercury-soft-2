$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& pnpm build
if ($LASTEXITCODE -ne 0) { throw 'Project build failed' }
& python scripts/build-universal-release.py
if ($LASTEXITCODE -ne 0) { throw 'Release packaging failed' }
& python scripts/verify-release.py
if ($LASTEXITCODE -ne 0) { throw 'Release verification failed' }
