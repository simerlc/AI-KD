call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\Tools\vsdevcmd.bat" -arch=amd64
cd /d E:\ztgt\AI培训\快搭\AIKD-V1
pnpm -w rebuild
pnpm --filter @aikd/server rebuild better-sqlite3 --build-from-source
pnpm --filter @aikd/server dev
