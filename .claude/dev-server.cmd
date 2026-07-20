@echo off
set PATH=C:\Users\s.wijdenes\AppData\Local\nodejs-portable\node-v22.21.1-win-x64;%PATH%
if not defined PORT set PORT=3000
if not defined NEXT_DIST_DIR set NEXT_DIST_DIR=.next-preview-%PORT%
call npm run dev -- -p %PORT%
