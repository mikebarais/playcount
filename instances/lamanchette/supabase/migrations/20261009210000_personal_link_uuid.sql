ALTER TABLE public.members
ALTER COLUMN personal_link TYPE uuid USING personal_link::uuid,
ALTER COLUMN personal_link SET DEFAULT gen_random_uuid();
