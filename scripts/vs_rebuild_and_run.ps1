# Auto rebuild script: find Visual Studio, run vcvarsall, rebuild native modules and start server
try {
  $vswhere = $null
  $possible = @("$env:ProgramFiles\Microsoft Visual Studio\Installer\vswhere.exe", "$env:ProgramFiles(x86)\Microsoft Visual Studio\Installer\vswhere.exe")
  foreach ($p in $possible) { if (Test-Path $p) { $vswhere = $p; break } }
  if (-not $vswhere) { Write-Error "vswhere.exe not found. Please install Visual Studio Installer or run this from Developer Command Prompt."; exit 2 }

  $installationPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
  if (-not $installationPath) { $installationPath = & $vswhere -latest -products * -property installationPath 2>$null }
  if (-not $installationPath) { Write-Error "Could not locate Visual Studio installation path via vswhere."; exit 3 }

  $vcvars = Join-Path $installationPath "VC\Auxiliary\Build\vcvarsall.bat"
  if (-not (Test-Path $vcvars)) { Write-Error "vcvarsall.bat not found at $vcvars"; exit 4 }

  $repo = (Get-Location).Path
  $tempCmd = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "aikd_build_and_run.cmd")

  $cmdContent = @"
@echo off
"$vcvars" x64 || exit /b %errorlevel%
cd /d "$repo"
pnpm -w rebuild || exit /b %errorlevel%
pnpm --filter @aikd/server rebuild better-sqlite3 --build-from-source || exit /b %errorlevel%
pnpm --filter @aikd/server dev
"@

  Set-Content -Path $tempCmd -Value $cmdContent -Encoding ASCII
  Write-Host "Created temp command file: $tempCmd"
  Write-Host "Running build script (output will stream). If this opens a long-running dev server, the script will keep running." -ForegroundColor Green
  cmd /c $tempCmd
} catch {
  Write-Error "Script failed: $_"
  exit 10
}
