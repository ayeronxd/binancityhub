-- ================================================
-- BARANGAY HUB - Trigger Update for Verification
-- ================================================
-- We must extract the verification_doc_url from the auth metadata
-- because the user is not authenticated yet when email confirmation is ON.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  full_name_value text;
  barangay_value text;
begin
  full_name_value := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email,'@',1));
  barangay_value := coalesce(new.raw_user_meta_data ->> 'barangay', 'Barangay Poblacion');

  insert into public.profiles (id, full_name, email, phone, age, role, barangay, verification_doc_url)
  values (
    new.id,
    full_name_value,
    new.email,
    new.raw_user_meta_data ->> 'phone',
    (new.raw_user_meta_data ->> 'age')::integer,
    'resident',
    barangay_value,
    new.raw_user_meta_data ->> 'verification_doc_url'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    age = excluded.age,
    barangay = excluded.barangay,
    verification_doc_url = excluded.verification_doc_url,
    updated_at = now();

  return new;
end;
$$;
