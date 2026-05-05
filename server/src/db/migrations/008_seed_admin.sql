-- Migration 008: Seed default admin user
-- Only inserts if no admin user exists yet.
-- Default credentials: username=admin, password=password
-- CHANGE THE PASSWORD IMMEDIATELY AFTER FIRST LOGIN.

DO $$
DECLARE
  v_dept_id UUID;
  v_count   INTEGER;
BEGIN
  -- Check if any admin user already exists
  SELECT COUNT(*) INTO v_count FROM users WHERE role = 'admin';
  IF v_count > 0 THEN
    RAISE NOTICE 'Admin user already exists — skipping seed.';
    RETURN;
  END IF;

  -- Get the OGM department id
  SELECT id INTO v_dept_id FROM departments WHERE code = 'OGM' LIMIT 1;
  IF v_dept_id IS NULL THEN
    RAISE NOTICE 'OGM department not found — skipping admin seed.';
    RETURN;
  END IF;

  -- Insert admin user
  -- Password hash is bcrypt of 'password' (cost 10)
  INSERT INTO users (username, password_hash, email, full_name, role, department_id)
  VALUES (
    'admin',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'admin@noneco.example.com',
    'System Administrator',
    'admin',
    v_dept_id
  )
  ON CONFLICT (username) DO NOTHING;

  RAISE NOTICE 'Admin user created. Login: admin / password — CHANGE THIS IMMEDIATELY.';
END;
$$;
