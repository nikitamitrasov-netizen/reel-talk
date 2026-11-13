param(
  [string]$Message = "Update Reel Talk"
)

# Commit the local changes and publish them to GitHub Pages.
# GitHub rebuilds the site in about a minute; the URL stays the same.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$ws = Split-Path -Parent $root
$git = Join-Path $ws ".tools\git\cmd\git.exe"
$gh = Join-Path $ws ".tools\gh\bin\gh.exe"
$ca = Join-Path $ws ".tools\git\ucrt64\etc\ssl\certs\ca-bundle.crt"
$env:GH_CONFIG_DIR = Join-Path $ws ".tools\gh-config"

if (-not (Test-Path $gh)) { throw "GitHub CLI not found at $gh" }
if (-not (Test-Path $git)) { throw "git not found at $git" }

Set-Location $root
$token = (& $gh auth token).Trim()
if (-not $token) { throw "Not signed in to GitHub" }

& $git add -A
$pending = & $git status --porcelain
if (-not $pending) {
  Write-Output "Nothing to publish - the working tree is clean."
  exit 0
}

& $git commit -m $Message | Out-Null
Write-Output "Committed: $Message"

& $git -c http.sslBackend=openssl -c "http.sslCAInfo=$ca" -c credential.helper= `
  push "https://x-access-token:$token@github.com/nikitamitrasov-netizen/reel-talk.git" main

Write-Output "Pushed. Pages will rebuild in about a minute:"
Write-Output "  https://nikitamitrasov-netizen.github.io/reel-talk/"
