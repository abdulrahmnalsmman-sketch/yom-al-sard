/*
# User access permissions

1. New table
- user_access_permissions stores grouped permissions for each account, including students, halqat, attendance, reports, fees, and user management.
- access_scope is either all_halqat or selected_halqat; selected_halqat_ids stores the selected halqa identifiers.

2. Security
- RLS is enabled.
- Only active admins can read or change permission rows.
- A privileged RPC upserts a complete permission set after checking the caller is an active admin.

3. Data safety
- Existing accounts and permissions are preserved. Rows are created only when an administrator saves permissions.
*/

CREATE TABLE IF NOT EXISTS user_access_permissions (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  can_view_students boolean NOT NULL DEFAULT false,
  can_add_students boolean NOT NULL DEFAULT false,
  can_edit_students boolean NOT NULL DEFAULT false,
  can_delete_students boolean NOT NULL DEFAULT false,
  can_view_halqat boolean NOT NULL DEFAULT false,
  can_add_halqat boolean NOT NULL DEFAULT false,
  can_edit_halqat boolean NOT NULL DEFAULT false,
  can_delete_halqat boolean NOT NULL DEFAULT false,
  can_record_attendance boolean NOT NULL DEFAULT false,
  can_edit_attendance boolean NOT NULL DEFAULT false,
  can_view_reports boolean NOT NULL DEFAULT false,
  can_export_reports boolean NOT NULL DEFAULT false,
  can_view_fees boolean NOT NULL DEFAULT false,
  can_collect_fees boolean NOT NULL DEFAULT false,
  can_manage_users boolean NOT NULL DEFAULT false,
  access_scope text NOT NULL DEFAULT 'all_halqat' CHECK (access_scope IN ('all_halqat', 'selected_halqat')),
  selected_halqat_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_access_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON user_access_permissions TO authenticated;
DROP POLICY IF EXISTS "admin_read_user_access_permissions" ON user_access_permissions;
CREATE POLICY "admin_read_user_access_permissions" ON user_access_permissions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND is_active));

CREATE OR REPLACE FUNCTION admin_save_user_access_permissions(
  p_profile_id uuid, p_role text, p_values jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND is_active) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF p_role NOT IN ('admin', 'supervisor', 'teacher') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  UPDATE profiles SET role = p_role WHERE id = p_profile_id AND id <> auth.uid();
  INSERT INTO user_access_permissions (profile_id, can_view_students, can_add_students, can_edit_students, can_delete_students, can_view_halqat, can_add_halqat, can_edit_halqat, can_delete_halqat, can_record_attendance, can_edit_attendance, can_view_reports, can_export_reports, can_view_fees, can_collect_fees, can_manage_users, access_scope, selected_halqat_ids, updated_at)
  VALUES (
    p_profile_id,
    coalesce((p_values->>'can_view_students')::boolean, false), coalesce((p_values->>'can_add_students')::boolean, false), coalesce((p_values->>'can_edit_students')::boolean, false), coalesce((p_values->>'can_delete_students')::boolean, false),
    coalesce((p_values->>'can_view_halqat')::boolean, false), coalesce((p_values->>'can_add_halqat')::boolean, false), coalesce((p_values->>'can_edit_halqat')::boolean, false), coalesce((p_values->>'can_delete_halqat')::boolean, false),
    coalesce((p_values->>'can_record_attendance')::boolean, false), coalesce((p_values->>'can_edit_attendance')::boolean, false), coalesce((p_values->>'can_view_reports')::boolean, false), coalesce((p_values->>'can_export_reports')::boolean, false), coalesce((p_values->>'can_view_fees')::boolean, false), coalesce((p_values->>'can_collect_fees')::boolean, false), coalesce((p_values->>'can_manage_users')::boolean, false),
    coalesce(p_values->>'access_scope', 'all_halqat'), coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_values->'selected_halqat_ids', '[]'::jsonb)))::uuid[], '{}'), now()
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    can_view_students = excluded.can_view_students, can_add_students = excluded.can_add_students, can_edit_students = excluded.can_edit_students, can_delete_students = excluded.can_delete_students,
    can_view_halqat = excluded.can_view_halqat, can_add_halqat = excluded.can_add_halqat, can_edit_halqat = excluded.can_edit_halqat, can_delete_halqat = excluded.can_delete_halqat,
    can_record_attendance = excluded.can_record_attendance, can_edit_attendance = excluded.can_edit_attendance, can_view_reports = excluded.can_view_reports, can_export_reports = excluded.can_export_reports,
    can_view_fees = excluded.can_view_fees, can_collect_fees = excluded.can_collect_fees, can_manage_users = excluded.can_manage_users, access_scope = excluded.access_scope, selected_halqat_ids = excluded.selected_halqat_ids, updated_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_save_user_access_permissions(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_save_user_access_permissions(uuid, text, jsonb) TO authenticated;
