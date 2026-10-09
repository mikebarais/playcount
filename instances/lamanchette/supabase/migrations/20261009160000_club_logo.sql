INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Path inside the public "branding" storage bucket.
ALTER TABLE public.clubs
ADD COLUMN logo_path text;

UPDATE public.clubs
SET logo_path = 'logo.jpg'
WHERE name = 'La Manchette';
