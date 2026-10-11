-- One timezone per club, used for every session; replaces the per-pattern timezone.
ALTER TABLE public.clubs ADD COLUMN timezone text;

UPDATE public.clubs AS c
SET timezone = coalesce(
    (SELECT p.timezone FROM public.schedule_patterns AS p WHERE p.club_id = c.id ORDER BY p.id LIMIT 1),
    'UTC'
);

ALTER TABLE public.clubs
ALTER COLUMN timezone SET DEFAULT 'UTC',
ALTER COLUMN timezone SET NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_upcoming_sessions()
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
        (o.local_date + p."time") AT TIME ZONE c.timezone,
        p.duration,
        p.location
    FROM public.schedule_patterns AS p
    JOIN public.clubs AS c ON c.id = p.club_id
    CROSS JOIN LATERAL (
        SELECT (now() AT TIME ZONE c.timezone)::date + n AS local_date
        FROM generate_series(0, 27) AS n
    ) AS o
    WHERE extract(dow FROM o.local_date) = p.day_of_week
    ON CONFLICT (schedule_pattern_id, occurrence_date) DO NOTHING;
END;
$$;

DROP FUNCTION public.admin_list_sessions();

-- Regular and exceptional sessions from today through the next 27 days, in date order.
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
    event_name text,
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
        s.event_name,
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

-- The time applies to the session's own date; a null minimum restores the pattern default (regular sessions only).
CREATE OR REPLACE FUNCTION public.admin_update_session(
    p_session_id uuid,
    p_start_time time,
    p_location text,
    p_min_players integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_club uuid := public.admin_club_id();
    normalized_location text := trim(coalesce(p_location, ''));
    target record;
BEGIN
    IF p_start_time IS NULL THEN
        RAISE EXCEPTION 'A start time is required.' USING ERRCODE = '22023';
    END IF;
    IF length(normalized_location) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'Location must be between 1 and 200 characters.' USING ERRCODE = '22023';
    END IF;
    IF p_min_players IS NOT NULL AND p_min_players < 1 THEN
        RAISE EXCEPTION 'Minimum players must be at least 1.' USING ERRCODE = '22023';
    END IF;

    SELECT
        s.schedule_pattern_id,
        c.timezone AS tz,
        coalesce(s.occurrence_date, (s.starts_at AT TIME ZONE c.timezone)::date) AS local_date
    INTO target
    FROM public.sessions AS s
    JOIN public.clubs AS c ON c.id = s.club_id
    WHERE s.id = p_session_id AND s.club_id = actor_club
    FOR UPDATE OF s;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session was not found.' USING ERRCODE = 'P0002';
    END IF;
    IF target.schedule_pattern_id IS NULL AND p_min_players IS NULL THEN
        RAISE EXCEPTION 'Exceptional sessions need a minimum number of players.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.sessions AS s
    SET starts_at = (target.local_date + p_start_time) AT TIME ZONE target.tz,
        location = normalized_location,
        min_players = p_min_players
    WHERE s.id = p_session_id;
END;
$$;

-- p_local_date and p_start_time are in the club's timezone.
CREATE FUNCTION public.admin_create_session(
    p_local_date date,
    p_start_time time,
    p_duration interval,
    p_location text,
    p_event_name text,
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
    normalized_name text := nullif(trim(coalesce(p_event_name, '')), '');
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
    IF length(normalized_name) > 120 THEN
        RAISE EXCEPTION 'Name must be 120 characters or fewer.' USING ERRCODE = '22023';
    END IF;
    IF p_event_type IS NOT NULL AND p_event_type NOT IN ('training', 'match', 'other') THEN
        RAISE EXCEPTION 'Unknown session type.' USING ERRCODE = '22023';
    END IF;
    IF normalized_name IS NULL AND p_event_type IS NULL THEN
        RAISE EXCEPTION 'A name or type is required.' USING ERRCODE = '22023';
    END IF;
    IF p_min_players IS NULL OR p_min_players < 1 THEN
        RAISE EXCEPTION 'Minimum players must be at least 1.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.sessions (
        club_id,
        starts_at,
        duration,
        location,
        min_players,
        event_name,
        event_type
    )
    VALUES (
        actor_club,
        (p_local_date + p_start_time) AT TIME ZONE club_timezone,
        p_duration,
        normalized_location,
        p_min_players,
        normalized_name,
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

ALTER TABLE public.schedule_patterns DROP COLUMN timezone;
