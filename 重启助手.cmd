@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Restart-Advisor.ps1"
if errorlevel 1 pause
