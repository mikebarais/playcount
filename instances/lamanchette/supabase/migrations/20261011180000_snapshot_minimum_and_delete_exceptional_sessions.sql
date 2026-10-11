UPDATE public.sessions AS s
SET min_players = p.min_players
FROM public.schedule_patterns AS p
WHERE s.schedule_pattern_id = p.id AND s.min_players IS NULL;

ALTER TABLE public.sessions
ADD CONSTRAINT sessions_regular_min_players_required
    CHECK (schedule_pattern_id IS NULL OR min_players IS NOT NULL);

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
        location,
        min_players
    )
    SELECT
        p.club_id,
        p.id,
        o.local_date,
        (o.local_date + p."time") AT TIME ZONE c.timezone,
        p.duration,
        p.location,
        p.min_players
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

CREATE FUNCTION public.admin_list_sessions()
RETURNS TABLE (
    session_id uuid,
    local_date date,
    local_time time,
    duration interval,
    location text,
    min_players integer,
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
    WHERE s.club_id = actor_club
      AND (s.starts_at AT TIME ZONE c.timezone)::date
          BETWEEN (now() AT TIME ZONE c.timezone)::date AND (now() AT TIME ZONE c.timezone)::date + 27
    ORDER BY s.starts_at;
END;
$$;

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
        c.timezone AS tz,
        coalesce(s.occurrence_date, (s.starts_at AT TIME ZONE c.timezone)::date) AS local_date,
        s.schedule_pattern_id IS NOT NULL AS is_regular
    INTO target
    FROM public.sessions AS s
    JOIN public.clubs AS c ON c.id = s.club_id
    WHERE s.id = p_session_id AND s.club_id = actor_club
    FOR UPDATE OF s;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session was not found.' USING ERRCODE = 'P0002';
    END IF;
    IF target.is_regular AND p_min_players IS NULL THEN
        RAISE EXCEPTION 'A minimum is required for regular sessions.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.sessions AS s
    SET starts_at = (target.local_date + p_start_time) AT TIME ZONE target.tz,
        location = normalized_location,
        min_players = p_min_players
    WHERE s.id = p_session_id;
END;
$$;

CREATE FUNCTION public.admin_delete_exceptional_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_club uuid := public.admin_club_id();
BEGIN
    DELETE FROM public.sessions AS s
    WHERE s.id = p_session_id AND s.club_id = actor_club AND s.schedule_pattern_id IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exceptional session was not found.' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_sessions() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_delete_exceptional_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_exceptional_session(uuid) TO authenticated;
