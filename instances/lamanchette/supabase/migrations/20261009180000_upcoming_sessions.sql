-- Identifies which pattern occurrence a session was generated for, so per-date time overrides never cause regeneration.
ALTER TABLE public.sessions
ADD COLUMN occurrence_date date,
ADD CONSTRAINT sessions_occurrence_requires_pattern
    CHECK (occurrence_date IS NULL OR schedule_pattern_id IS NOT NULL),
ADD CONSTRAINT sessions_pattern_occurrence_key UNIQUE (schedule_pattern_id, occurrence_date);

UPDATE public.sessions AS s
SET occurrence_date = (s.starts_at AT TIME ZONE p.timezone)::date
FROM public.schedule_patterns AS p
WHERE s.schedule_pattern_id = p.id
  AND s.occurrence_date IS NULL;

CREATE FUNCTION public.is_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.members WHERE id = (SELECT auth.uid()));
$$;

REVOKE EXECUTE ON FUNCTION public.is_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member() TO authenticated;

CREATE POLICY "Members can read schedule patterns"
ON public.schedule_patterns
FOR SELECT
TO authenticated
USING ((SELECT public.is_member()));

CREATE POLICY "Members can read sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING ((SELECT public.is_member()));

-- Creates any missing pattern sessions from today through the next 4 weeks in each pattern's timezone.
CREATE FUNCTION public.ensure_upcoming_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_member() THEN
        RAISE EXCEPTION 'Only club members can load sessions.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.sessions (
        club_id,
        schedule_pattern_id,
        occurrence_date,
        starts_at,
        duration,
        location
    )
    SELECT
        p.club_id,
        p.id,
        o.local_date,
        (o.local_date + p."time") AT TIME ZONE p.timezone,
        p.duration,
        p.location
    FROM public.schedule_patterns AS p
    CROSS JOIN LATERAL (
        SELECT (now() AT TIME ZONE p.timezone)::date + n AS local_date
        FROM generate_series(0, 27) AS n
    ) AS o
    WHERE extract(dow FROM o.local_date) = p.day_of_week
    ON CONFLICT (schedule_pattern_id, occurrence_date) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_upcoming_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_upcoming_sessions() TO authenticated;
