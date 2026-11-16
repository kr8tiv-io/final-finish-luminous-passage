# Prepare-only. Do not run until the film job has finished writing out\.
# Backs up the current site media, then copies the new films and posters into place.
# Usage: pwsh -File tools\swap-job-films.ps1
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$source = "C:\Users\lucid\Desktop\Final Finish Epoxy handoff\job-films-2026-11-15\out"
if (-not (Test-Path -LiteralPath $source)) {
  throw "Film output folder is not ready: $source"
}

function Copy-WithBackup([string]$from, [string]$to) {
  if (-not (Test-Path -LiteralPath $from)) {
    Write-Warning "Missing source, skipped: $from"
    return
  }
  $dest = Join-Path $repo $to
  $parent = Split-Path -Parent $dest
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent | Out-Null
  }
  if (Test-Path -LiteralPath $dest) {
    $backup = "$dest.bak-2026-11-15"
    if (-not (Test-Path -LiteralPath $backup)) {
      Copy-Item -LiteralPath $dest -Destination $backup
    }
  }
  Copy-Item -LiteralPath $from -Destination $dest -Force
  Write-Output "copied $to"
}

$videos = @(
  "epoxy-basement.mp4",
  "epoxy-finish.mp4",
  "epoxy-commercial.mp4",
  "epoxy-consultation.mp4",
  "epoxy-resources-stairs.mp4"
)
foreach ($quality in @("720", "480")) {
  foreach ($name in $videos) {
    $from = Join-Path $source "$quality\$name"
    if (-not (Test-Path -LiteralPath $from)) {
      $from = Join-Path $source $name
    }
    Copy-WithBackup $from "videos\follow-floor\$quality\$name"
  }
}

$posters = @(
  "epoxy-basement-poster.jpg",
  "epoxy-finish-poster.jpg",
  "epoxy-commercial-poster.jpg",
  "epoxy-consultation-poster.jpg",
  "epoxy-resources-stairs-poster.webp",
  "luminous-finish-hall.jpg",
  "luminous-finish-hall.webp",
  "foundation-chamber.jpg",
  "foundation-chamber.webp",
  "consultation-court.webp"
)
foreach ($name in $posters) {
  Copy-WithBackup (Join-Path $source $name) "images\brand\$name"
}

$resources = Join-Path $repo "resources\index.html"
if ((Test-Path -LiteralPath (Join-Path $repo "images\brand\epoxy-resources-stairs-poster.webp")) -and (Test-Path -LiteralPath $resources)) {
  $html = [System.IO.File]::ReadAllText($resources)
  $updated = $html.Replace("pearl-stair-v2.webp", "epoxy-resources-stairs-poster.webp")
  if ($updated -ne $html) {
    $backup = "$resources.bak-2026-11-15"
    if (-not (Test-Path -LiteralPath $backup)) {
      Copy-Item -LiteralPath $resources -Destination $backup
    }
    [System.IO.File]::WriteAllText($resources, $updated)
    Write-Output "updated resources poster reference"
  }
}

Write-Output "Job film swap finished. Review the pages before any deploy."
