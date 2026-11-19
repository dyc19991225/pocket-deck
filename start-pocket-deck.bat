@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" "http://127.0.0.1:4799/"
if exist "runtime\node.exe" (
  "runtime\node.exe" bin/pocket-deck.mjs --port 4799
) else (
  node bin/pocket-deck.mjs --port 4799
)
pause
