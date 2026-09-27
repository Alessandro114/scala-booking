-- Saving availability (PUT /api/availability -> setAvailability) updates User.timeZone
-- under action='availability_write' (apps/web/src/server/services/availability.ts:140),
-- but the app_user_update RLS policy only allowed action='account_write'. Every save
-- since RLS went live hit P2025 "No record was found for an update." (Prisma sees the
-- RLS-filtered zero-row result as a not-found on update()). Same pattern already used by
-- app_workspace_update, which allows an array of actions.
ALTER POLICY app_user_update ON "User" USING (
  current_setting('tempocove.action', true) = ANY (ARRAY['account_write', 'availability_write']) AND
  tempocove_workspace_access(current_setting('tempocove.workspace_id', true)) AND
  id = current_setting('tempocove.user_id', true)
) WITH CHECK (
  current_setting('tempocove.action', true) = ANY (ARRAY['account_write', 'availability_write']) AND
  id = current_setting('tempocove.user_id', true)
);
