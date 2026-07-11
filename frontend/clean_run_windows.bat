@echo off

echo Cleaning npm dependencies...
rd /s /q node_modules
del /f /q package-lock.json

echo Cleaning Next.js build cache...
rd /s /q .next
rd /s /q out

echo Installing npm dependencies...
call pnpm install

echo Building the project...
call pnpm run tauri dev
