ALTER TABLE public.schedule_patterns
ADD COLUMN timezone text;

UPDATE public.schedule_patterns AS patterns
SET timezone = clubs.timezone
FROM public.clubs AS clubs
WHERE patterns.club_id = clubs.id;

ALTER TABLE public.schedule_patterns
ALTER COLUMN timezone SET NOT NULL;

ALTER TABLE public.clubs
DROP COLUMN timezone;