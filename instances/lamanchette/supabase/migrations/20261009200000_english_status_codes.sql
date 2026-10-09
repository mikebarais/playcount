-- Status values are language-neutral codes; the frontend translates them for display.
ALTER TABLE public.sessions DROP CONSTRAINT sessions_status_check;
ALTER TABLE public.attendances DROP CONSTRAINT attendances_status_check;

UPDATE public.sessions
SET status = CASE status WHEN 'planifiée' THEN 'scheduled' WHEN 'annulée' THEN 'cancelled' ELSE status END;

UPDATE public.attendances
SET status = CASE status
    WHEN 'Présent' THEN 'present'
    WHEN 'Incertain' THEN 'uncertain'
    WHEN 'Absent' THEN 'absent'
    ELSE status
END;

ALTER TABLE public.sessions
ALTER COLUMN status SET DEFAULT 'scheduled',
ADD CONSTRAINT sessions_status_check CHECK (status IN ('scheduled', 'cancelled'));

ALTER TABLE public.attendances
ADD CONSTRAINT attendances_status_check CHECK (status IN ('present', 'uncertain', 'absent'));
