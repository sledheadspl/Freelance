-- Storage bucket for scan photos.
-- Objects are stored under `${user_id}/...` so RLS can scope access per user.
insert into storage.buckets (id, name, public)
values ('scan-images', 'scan-images', false)
on conflict (id) do nothing;

create policy "Users can upload their own scan images"
  on storage.objects for insert
  with check (
    bucket_id = 'scan-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can view their own scan images"
  on storage.objects for select
  using (
    bucket_id = 'scan-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own scan images"
  on storage.objects for delete
  using (
    bucket_id = 'scan-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
