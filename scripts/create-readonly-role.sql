-- Read-only role for the checkin-monitor site.
-- Run once as a privileged user (e.g. the Supabase "postgres" user):
--   psql "$ADMIN_DATABASE_URL" -f scripts/create-readonly-role.sql
-- Replace the password placeholder first.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'monitor_ro') THEN
    CREATE ROLE monitor_ro LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
  END IF;
END $$;

ALTER ROLE monitor_ro SET default_transaction_read_only = on;
ALTER ROLE monitor_ro SET statement_timeout = '15s';

-- Replace "postgres" with your database name if different.
GRANT CONNECT ON DATABASE postgres TO monitor_ro;
GRANT USAGE ON SCHEMA public TO monitor_ro;

-- Only the tables the monitor needs. Nothing else (no PINs, tokens, push tokens...).
GRANT SELECT ON "Attendance"   TO monitor_ro;
GRANT SELECT ON "Organization" TO monitor_ro;
GRANT SELECT ON "LocationPing" TO monitor_ro;

-- Tables used by the day timeline. NEVER grant "PushToken".
GRANT SELECT ON "AttendancePause" TO monitor_ro;
GRANT SELECT ON "WorkSegment"     TO monitor_ro;
GRANT SELECT ON "TimedPermission" TO monitor_ro;
GRANT SELECT ON "Shift"           TO monitor_ro;
GRANT SELECT ON "ShiftAssignment" TO monitor_ro;
-- "OvertimeRequest": column-level, so the photo bytes stay unreadable.
GRANT SELECT ("id", "attendanceId", "estimatedEndAt", "reason", "createdAt", "status",
              "reviewedAt", "reviewedByName", "submittedAt")
  ON "OvertimeRequest" TO monitor_ro;

-- "User": column-level only. "pinHash" and every other secret stay unreadable.
GRANT SELECT ("id", "employeeCode", "name", "role", "organizationId",
              "workMode", "faceVerificationEnabled", "active")
  ON "User" TO monitor_ro;

-- "CheckInAttempt" is created by migration 20261112000000_checkin_attempt_log.
-- (table-level SELECT also covers its "photo" / "hasPhoto" columns: failed-face photos).
-- Grant it only if it already exists; re-run this script after applying the migration.
DO $$
BEGIN
  IF to_regclass('public."CheckInAttempt"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON "CheckInAttempt" TO monitor_ro';
  ELSE
    RAISE NOTICE 'CheckInAttempt does not exist yet - re-run this script after the migration.';
  END IF;
END $$;

-- "AttendanceEvent" is created by migration 20261113000000_attendance_events (same only-if-exists pattern).
DO $$
BEGIN
  IF to_regclass('public."AttendanceEvent"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON "AttendanceEvent" TO monitor_ro';
  ELSE
    RAISE NOTICE 'AttendanceEvent does not exist yet - re-run this script after the migration.';
  END IF;
END $$;
