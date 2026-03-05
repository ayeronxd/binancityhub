# Binan City Hub - Supabase Migration

This project now reads operational data and analytics from Supabase instead of hardcoded arrays.

## Files Added
- `supabase-config.js` - Supabase project URL/key placeholders
- `supabase-schema.sql` - Tables, view, triggers, and RLS policies

## Files Updated
- `index.html` - Loads Supabase SDK and shared config
- `login.html` - Loads Supabase SDK and shared config
- `admin.html` - Loads Supabase SDK and shared config
- `main.js` - Frontend data + analytics from Supabase
- `auth.js` - Supabase Auth login/signup + role redirect
- `admin.js` - Admin data and actions via Supabase

## Setup Steps
1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase-schema.sql`.
3. In `supabase-config.js`, set:
   - `window.BCH_SUPABASE_URL`
   - `window.BCH_SUPABASE_ANON_KEY`
4. In Supabase Authentication settings, configure site URL and redirect URLs for your local deployment.
5. Create one `super_admin` user by updating `profiles.role` directly from SQL for your admin account.

## What Is Now Database-Driven
- Worker directory
- Announcements feed
- Barangay coverage analytics table
- Resident document requests and tracker
- Issue reports list
- Dashboard charts and summary counters
- Signup barangay options

## Notes
- If Supabase keys are not configured, the UI shows a configuration warning and avoids fake records.
- RLS enforces public read-only access for announcements/workers and authenticated inserts for resident services.
