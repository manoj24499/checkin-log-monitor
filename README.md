# Inzivo Monitor

Read-only monitoring website for the Inzivo check-in product: every check-in/out, face verification result, location and alert. Single admin login. Next.js 16 (App Router), React 19, Tailwind 4, `pg`, `jose`, Leaflet. No Prisma, no writes.

## Pages

| Route | What |
|---|---|
| `/` | Overview for a chosen IST day: counts + "Needs attention" |
| `/log` | Unified activity log (accepted records + every attempt), filters, CSV export |
| `/faces` | Face verification results, photos, failed-verification attempts (with photos), gaps |
| `/map` | Check-in/out points on one map; pick an employee to draw the day's trail and tracking gaps (>15 min) |
| `/employees`, `/employees/[code]` | Searchable list; per-employee timeline, attempts, photos |
| `/alerts` | "Needs attention" rules over a date range (filter by "How") |
| `/employees/[code]/day?date=YYYY-MM-DD` | Forensic day timeline for one employee (see below) |

All times are shown in IST (12-hour). Overview and Log auto-refresh every 60 s (pausable).

## Day timeline (forensic view)

`/employees/<code>/day?date=YYYY-MM-DD` proves what happened on one IST day (including the part of an overnight session after midnight). It has:

- A **"How did each check-in / check-out happen?"** card: one plain-English line per record (employee with slide button / offline queue / kiosk, with app version, phone, OS and location; automatic by the system with trigger, shift, warning and whether the notification was delivered; manual by admin with reason). Old automatic check-outs with no event row say details were not recorded and show a computed likely cause (check-out time vs. the shift assigned for that weekday, overtime end, permission end, end of day). A red chip appears if the employee kept sending location pings or made later swipe attempts after an automatic check-out.
- One **chronological feed** (IST, with seconds) merging swipe attempts (accepted and refused), attendance records, `AttendanceEvent` rows (auto check-outs, warnings, manual entries, every push and whether delivered), pauses, work segments, permissions, overtime requests and a location-ping summary with every gap over 15 minutes. Each item has an expandable raw detail.

It is linked from the employee page (each day), Activity log rows, and the Employees list (Overview has a lookup box). The employee page also shows **Shift assignments** (7 weekdays) and **Automatic check-outs** for the date range. `/log` and `/alerts` have a **How** filter (swipe / offline sync / kiosk / automatic / manual); `/alerts` has an "Automatic check-outs" rule with trigger and warning delivery.

### Backend migration 20261113000000_attendance_events

Adds `CheckInAttempt` columns `appVersion`, `platform`, `osVersion`, `deviceModel`, `clientAction` (SLIDE_TO_CONFIRM | OFFLINE_SYNC) and the `AttendanceEvent` table. Until it is applied the site keeps working: the timeline shows a notice and uses what exists. **After applying it, re-run `scripts/create-readonly-role.sql`** - it also grants the extra read-only tables used here (`AttendancePause`, `WorkSegment`, `TimedPermission`, `Shift`, `ShiftAssignment`, `OvertimeRequest` without its photo, and `AttendanceEvent`). `PushToken` is never granted.

## Setup

1. `cp .env.example .env` and fill in:
   - `MONITOR_DATABASE_URL` - connection string of the **read-only** role (below)
   - `MONITOR_PASSWORD` - the admin password
   - `MONITOR_SESSION_SECRET` - 32+ random characters (`openssl rand -base64 48`)
2. `npm install && npm run build`
3. `npm start` (listens on port 3100; edit the `start` script in `package.json` to change it)

## Read-only database role

Edit the password placeholder in `scripts/create-readonly-role.sql`, then run it once as a privileged DB user:

```
psql "<ADMIN_DATABASE_URL>" -f scripts/create-readonly-role.sql
```

It creates `monitor_ro` (default read-only transactions), grants SELECT on `"Attendance"`, `"Organization"`, `"LocationPing"`, `"CheckInAttempt"` (if it exists; re-run the script after applying migration `20261112000000_checkin_attempt_log`), and **column-level** SELECT on `"User"` (id, employeeCode, name, role, organizationId, workMode, faceVerificationEnabled, active) - never `pinHash`. Then set `MONITOR_DATABASE_URL=postgresql://monitor_ro:<password>@<host>:5432/<db>`. On Supabase use the pooler host and user `monitor_ro.<project-ref>` as appropriate. The app only runs parameterized SELECT/WITH statements (enforced in `lib/db.ts`), with a pool of max 5 and a 15 s statement timeout.

Until the `CheckInAttempt` table exists, pages show a notice and keep working from `"Attendance"`.

## Run with pm2

```
pm2 start npm --name checkin-monitor -- start
pm2 save
```

## nginx (put it behind HTTPS)

```
server {
    listen 443 ssl;
    server_name monitor.example.com;
    # ssl_certificate / ssl_certificate_key ... (e.g. certbot)

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server { listen 80; server_name monitor.example.com; return 301 https://$host$request_uri; }
```

The session cookie is `Secure` only when the request arrives as HTTPS (`X-Forwarded-Proto`), so do not expose this over plain HTTP. The login rate limit (5 failures / 10 min / IP) is in memory and uses the first `X-Forwarded-For` entry, so keep the app reachable only through nginx (bind/firewall port 3100).

## Notes

- Check-in "points" on the map come from `CheckInAttempt` coordinates; accepted records without an attempt row use the nearest `LocationPing` within 5 minutes (marked approximate).
- Failed-face photos live on `CheckInAttempt` (`reasonCode = 'FACE_MISMATCH'`) and are removed by the backend after retention; expired ones show a "photo expired" placeholder.
- CSV export is capped at 20,000 rows and prefixes cells starting with `= + - @` with `'`.
