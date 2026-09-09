-- Default organization and super-admin for local development

INSERT INTO administration.organization (name, slug)
VALUES ('Default', 'default')
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  v_org_id uuid;
  v_user_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_super_admin_role_id uuid;
BEGIN
  SELECT id INTO v_org_id FROM administration.organization WHERE slug = 'default';

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Default organization not found';
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    'admin@default.local',
    extensions.crypt('123456', extensions.gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'admin', 'organization_id', v_org_id),
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, EXCLUDED.email_confirmed_at),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

  DELETE FROM auth.identities WHERE user_id = v_user_id AND provider = 'email';

  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at,
    id
  ) VALUES (
    v_user_id::text,
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', 'admin@default.local',
      'email_verified', true
    ),
    'email',
    NOW(),
    NOW(),
    NOW(),
    gen_random_uuid()
  );

  INSERT INTO administration.user (
    uid,
    email,
    display_name,
    organization_id,
    is_active,
    must_change_password
  )
  VALUES (
    v_user_id,
    'admin@default.local',
    'admin',
    v_org_id,
    true,
    false
  )
  ON CONFLICT (uid) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    organization_id = EXCLUDED.organization_id,
    is_active = true,
    must_change_password = false,
    updated_at = NOW();

  SELECT id INTO v_super_admin_role_id FROM administration.role WHERE name = 'super_admin';

  IF v_super_admin_role_id IS NOT NULL THEN
    DELETE FROM administration.user_role WHERE uid = v_user_id;
    INSERT INTO administration.user_role (uid, role_id) VALUES (v_user_id, v_super_admin_role_id);
  END IF;
END $$;
