# Show Jumping Competition Platform

מערכת ניהול תחרויות קפיצות ראווה בזמן אמת.

## הפעלה (Windows PowerShell — 3 חלונות)

### חלון 1 — DB
```powershell
cd e:\PROJECTS\HORSE_JUMPING\NEW
docker compose up -d
```

### חלון 2 — שרת (port 4000)
```powershell
cd e:\PROJECTS\HORSE_JUMPING\NEW\server
npm run dev
```

### חלון 3 — לקוח (port 5173)
```powershell
cd e:\PROJECTS\HORSE_JUMPING\NEW\client
npm run dev
```
