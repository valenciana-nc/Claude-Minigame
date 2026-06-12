# Registers the clawd:// URL protocol for the current user, so terminal
# hyperlinks (e.g. the crab in your Claude Code statusline) can launch the game.
#
#   install:    powershell -ExecutionPolicy Bypass -File tools\install-protocol.ps1
#   uninstall:  powershell -ExecutionPolicy Bypass -File tools\install-protocol.ps1 -Uninstall
#
# Writes only under HKCU (no admin needed).
param([switch]$Uninstall)

$key = "HKCU:\Software\Classes\clawd"

if ($Uninstall) {
  Remove-Item -Path $key -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "clawd:// protocol removed."
  exit 0
}

$node = (Get-Command node -ErrorAction Stop).Source
$game = Join-Path (Split-Path $PSScriptRoot -Parent) "bin\clawd.js"
if (-not (Test-Path $game)) { throw "Game not found at $game" }

New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $key -Name "(Default)" -Value "URL:Claude Runner"
New-ItemProperty -Path $key -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

# `start` opens the game in a fresh window of the default terminal.
$launch = "$env:SystemRoot\System32\cmd.exe /c start `"Claude Runner`" `"$node`" `"$game`" run `"%1`""
Set-ItemProperty -Path "$key\shell\open\command" -Name "(Default)" -Value $launch

Write-Host "clawd:// registered."
Write-Host "  launcher: $launch"
Write-Host "  test it:  start clawd://play"
