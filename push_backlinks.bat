@echo off
cd /d "%~dp0"
git add courtage-credit-immobilier.html investissement-immobilier.html investissement-immobilier-ancien.html
git commit -m "SEO: backlinks vers pret-immobilier.proactifsconseils.fr depuis 3 pages immobilier"
git push origin main
echo.
echo Deploiement Vercel en cours (~30 secondes)...
pause
