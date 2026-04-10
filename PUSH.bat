@echo off
cd /d "%~dp0"
echo.
echo  ============================================
echo   Pushing changes to GitHub...
echo  ============================================
echo.
git push
echo.
if %errorlevel% equ 0 (
  echo  SUCCESS - Vercel will auto-deploy in 2-3 min
  echo  Check: https://vercel.com/dashboard
) else (
  echo  FAILED - check error above
  echo  You may need to open GitHub Desktop instead
)
echo.
pause
