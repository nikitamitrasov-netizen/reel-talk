param(
  [string]$Base = "http://127.0.0.1:8000",
  [string]$Out = "preview",
  [string]$Only = ""
)

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profile = Join-Path $env:TEMP ("rt-shot-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root $Out
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$shots = @(
  @{ name = "home";          url = "/index.html";                                  w = 1440; h = 1100 },
  @{ name = "home-full";     url = "/index.html";                                  w = 1440; h = 5600 },
  @{ name = "home-mobile";   url = "/index.html";                                  w = 500;  h = 1500 },
  @{ name = "film";          url = "/film.html#/f/home-alone";                     w = 1440; h = 1500 },
  @{ name = "film-tasks";    url = "/film.html#/f/home-alone/tasks";               w = 1440; h = 1500 },
  @{ name = "film-act";      url = "/film.html#/f/home-alone/act";                 w = 1440; h = 1300 },
  @{ name = "film-teacher";  url = "/film.html#/f/home-alone/teacher";             w = 1440; h = 1600 },
  @{ name = "watch";         url = "/watch.html?new=1&relay=none#/w/his-girl-friday";         w = 1440; h = 1000 },
  @{ name = "watch-external";url = "/watch.html?new=1&relay=none#/w/inception";               w = 1440; h = 1000 },
  @{ name = "quest";         url = "/quest.html?relay=none";                                  w = 1440; h = 1200 },
  @{ name = "quest-board";   url = "/quest.html?relay=none#/build/home-alone";                w = 1440; h = 1100 },
  @{ name = "print";         url = "/print.html#/ws/home-alone";                   w = 1000; h = 1400 },
  @{ name = "watch-poll";    url = "/watch.html?new=1&relay=none&demo=poll#/w/inception"; w = 1440; h = 1000 },
  @{ name = "film-series";   url = "/film.html#/f/sherlock-s1e1";                  w = 1440; h = 1400 },
  @{ name = "quest-station"; url = "/quest.html?relay=none#/s/home-alone/1";               w = 500;  h = 1000 },
  @{ name = "film-quest";    url = "/film.html#/f/home-alone/quest";             w = 1440; h = 1200 },
  @{ name = "print-key";     url = "/print.html#/ws/home-alone/key";             w = 1000; h = 1400 },
  @{ name = "watch-mobile";  url = "/watch.html?new=1&relay=none#/w/inception";             w = 500;  h = 1100 }
)

foreach ($s in $shots) {
  if ($Only -and $Only -ne $s.name) { continue }
  $file = Join-Path $outDir ($s.name + ".png")
  Remove-Item $file -Force -ErrorAction SilentlyContinue
  & $chrome --headless=new --no-sandbox --disable-gpu --disable-crashpad --hide-scrollbars --no-first-run `
    --user-data-dir=$profile --window-size="$($s.w),$($s.h)" --virtual-time-budget=6000 `
    --force-device-scale-factor=1 --screenshot=$file ($Base + $s.url) 2>$null | Out-Null
  if (Test-Path $file) { Write-Output ("OK   " + $s.name + "  " + [math]::Round((Get-Item $file).Length / 1KB) + " KB") }
  else { Write-Output ("FAIL " + $s.name + "  exit=" + $LASTEXITCODE) }
}

Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue
