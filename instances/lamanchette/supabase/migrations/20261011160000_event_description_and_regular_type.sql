ALTER TABLE public.sessions RENAME COLUMN event_name TO event_description;

UPDATE public.sessions
SET event_type = 'regular'
WHERE schedule_pattern_id IS NOT NULL;

UPDATE public.sessions
SET event_type = 'training'
WHERE schedule_pattern_id IS NULL AND event_type IS NULL;

ALTER TABLE public.sessions
ALTER COLUMN event_type SET DEFAULT 'regular',
ALTER COLUMN event_type SET NOT NULL,
ADD CONSTRAINT sessions_event_type_matches_pattern CHECK (
    (schedule_pattern_id IS NOT NULL AND event_type = 'regular')
    OR (schedule_pattern_id IS NULL AND event_type <> 'regular')
);

DROP FUNCTION public.admin_list_sessions();

CREATE FUNCTION public.admin_list_sessions()
RETURNS TABLE (
    session_id uuid,
    local_date date,
    local_time time,
    duration interval,
    location text,
    min_players integer,
    default_min_players integer,
    status text,
    cancellation_reason text,
    event_description text,
    event_type text,
    is_exceptional boolean,
    guests jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_club uuid := public.admin_club_id();
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        (s.starts_at AT TIME ZONE c.timezone)::date,
        (s.starts_at AT TIME ZONE c.timezone)::time,
        s.duration,
        s.location,
        s.min_players,
        p.min_players,
        s.status,
        s.cancellation_reason,
        s.event_description,
        s.event_type,
        s.schedule_pattern_id IS NULL,
        coalesce(
            (
                SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
                FROM public.exceptional_players AS g
                WHERE g.session_id = s.id
            ),
            '[]'::jsonb
        )
    FROM public.sessions AS s
    JOIN public.clubs AS c ON c.id = s.club_id
    LEFT JOIN public.schedule_patterns AS p ON p.id = s.schedule_pattern_id
    WHERE s.club_id = actor_club
      AND (s.starts_at AT TIME ZONE c.timezone)::date
          BETWEEN (now() AT TIME ZONE c.timezone)::date AND (now() AT TIME ZONE c.timezone)::date + 27
    ORDER BY s.starts_at;
END;
$$;

DROP FUNCTION public.admin_create_session(date, time, interval, text, text, text, integer);

CREATE FUNCTION public.admin_create_session(
    p_local_date date,
    p_start_time time,
    p_duration interval,
    p_location text,
    p_event_description text,
    p_event_type text,
    p_min_players integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_club uuid := public.admin_club_id();
    club_timezone text;
    normalized_location text := trim(coalesce(p_location, ''));
    normalized_description text := nullif(trim(coalesce(p_event_description, '')), '');
    new_session_id uuid;
BEGIN
    SELECT c.timezone INTO club_timezone FROM public.clubs AS c WHERE c.id = actor_club;

    IF p_local_date IS NULL OR p_start_time IS NULL THEN
        RAISE EXCEPTION 'A date and start time are required.' USING ERRCODE = '22023';
    END IF;
    IF p_local_date < (now() AT TIME ZONE club_timezone)::date THEN
        RAISE EXCEPTION 'The session date cannot be in the past.' USING ERRCODE = '22023';
    END IF;
    IF p_duration IS NULL OR p_duration <= interval '0' OR p_duration > interval '24 hours' THEN
        RAISE EXCEPTION 'Duration must be between 1 minute and 24 hours.' USING ERRCODE = '22023';
    END IF;
    IF length(normalized_location) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'Location must be between 1 and 200 characters.' USING ERRCODE = '22023';
    END IF;
    IF length(normalized_description) > 120 THEN
        RAISE EXCEPTION 'Description must be 120 characters or fewer.' USING ERRCODE = '22023';
    END IF;
    IF p_event_type IS NULL OR p_event_type NOT IN ('training', 'match') THEN
        RAISE EXCEPTION 'Session type must be training or match.' USING ERRCODE = '22023';
    END IF;
    IF p_min_players IS NOT NULL AND p_min_players < 1 THEN
        RAISE EXCEPTION 'Minimum players must be at least 1.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.sessions (
        club_id,
        starts_at,
        duration,
        location,
        min_players,
        event_description,
        event_type
    )
    VALUES (
        actor_club,
        (p_local_date + p_start_time) AT TIME ZONE club_timezone,
        p_duration,
        normalized_location,
        p_min_players,
        normalized_description,
        p_event_type
    )
    RETURNING id INTO new_session_id;

    RETURN new_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_sessions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_session(date, time, interval, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_session(date, time, interval, text, text, text, integer) TO authenticated;
