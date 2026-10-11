ALTER TABLE public.schedule_patterns
ADD COLUMN is_paused boolean NOT NULL DEFAULT false,
ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;

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
        club_id, schedule_pattern_id, occurrence_date, starts_at, duration, location, min_players
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
        WHERE NOT p.is_paused
            AND NOT p.is_deleted
      AND extract(dow FROM o.local_date) = p.day_of_week
    ON CONFLICT (schedule_pattern_id, occurrence_date) DO NOTHING;
END;
$$;

DROP FUNCTION public.admin_list_patterns();

CREATE FUNCTION public.admin_list_patterns()
RETURNS TABLE (
    id uuid,
    day_of_week smallint,
    "time" time,
    duration_minutes integer,
    location text,
    min_players integer,
    is_paused boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.id, p.day_of_week, p."time", round(extract(epoch FROM p.duration) / 60)::integer,
           p.location, p.min_players, p.is_paused
    FROM public.schedule_patterns AS p
    WHERE p.club_id = public.admin_club_id() AND NOT p.is_deleted
    ORDER BY p.day_of_week, p."time", p.id;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_pattern(
    p_pattern_id uuid,
    p_day_of_week integer,
    p_time time,
    p_duration_minutes integer,
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
    original record;
BEGIN
    IF p_day_of_week IS NULL OR p_day_of_week NOT BETWEEN 0 AND 6 THEN
        RAISE EXCEPTION 'Choose a day of the week.' USING ERRCODE = '22023';
    END IF;
    IF p_time IS NULL THEN
        RAISE EXCEPTION 'A start time is required.' USING ERRCODE = '22023';
    END IF;
    IF p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 1 AND 1440 THEN
        RAISE EXCEPTION 'Duration must be between 1 and 1440 minutes.' USING ERRCODE = '22023';
    END IF;
    IF length(normalized_location) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'Location must be between 1 and 200 characters.' USING ERRCODE = '22023';
    END IF;
    IF p_min_players IS NULL OR p_min_players < 1 THEN
        RAISE EXCEPTION 'Minimum players must be at least 1.' USING ERRCODE = '22023';
    END IF;

    SELECT p.is_paused, p.day_of_week, p."time", p.duration, p.location, p.min_players
    INTO original
    FROM public.schedule_patterns AS p
    WHERE p.id = p_pattern_id AND p.club_id = actor_club AND NOT p.is_deleted
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pattern not found.' USING ERRCODE = 'P0002';
    END IF;

    IF original.day_of_week = p_day_of_week
       AND original."time" = p_time
       AND original.duration = make_interval(mins => p_duration_minutes)
       AND original.location = normalized_location
       AND original.min_players = p_min_players THEN
        RETURN;
    END IF;

    UPDATE public.sessions AS s
    SET schedule_pattern_id = NULL,
        occurrence_date = NULL,
        event_type = 'training',
        min_players = NULL
    WHERE s.schedule_pattern_id = p_pattern_id
      AND s.club_id = actor_club
      AND s.starts_at >= now();

    UPDATE public.schedule_patterns AS p
    SET day_of_week = p_day_of_week,
        "time" = p_time,
        duration = make_interval(mins => p_duration_minutes),
        location = normalized_location,
        min_players = p_min_players
    WHERE p.id = p_pattern_id AND p.club_id = actor_club;

    IF NOT original.is_paused THEN
        PERFORM public.ensure_upcoming_sessions();
    END IF;
END;
$$;

CREATE FUNCTION public.admin_set_pattern_paused(p_pattern_id uuid, p_paused boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_club uuid := public.admin_club_id();
    was_paused boolean;
BEGIN
    IF p_paused IS NULL THEN
        RAISE EXCEPTION 'Pattern status is required.' USING ERRCODE = '22023';
    END IF;

    SELECT p.is_paused INTO was_paused
    FROM public.schedule_patterns AS p
    WHERE p.id = p_pattern_id AND p.club_id = actor_club AND NOT p.is_deleted
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pattern not found.' USING ERRCODE = 'P0002';
    END IF;
    IF was_paused = p_paused THEN
        RETURN;
    END IF;

    UPDATE public.schedule_patterns AS p
    SET is_paused = p_paused
    WHERE p.id = p_pattern_id AND p.club_id = actor_club;

    IF p_paused THEN
        UPDATE public.sessions AS s
        SET schedule_pattern_id = NULL,
            occurrence_date = NULL,
            event_type = 'training',
            min_players = NULL
        WHERE s.schedule_pattern_id = p_pattern_id
          AND s.club_id = actor_club
          AND s.starts_at >= now();
    ELSE
        PERFORM public.ensure_upcoming_sessions();
    END IF;
END;
$$;

CREATE FUNCTION public.admin_delete_pattern(p_pattern_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_club uuid := public.admin_club_id();
    target_id uuid;
BEGIN
    SELECT p.id INTO target_id
    FROM public.schedule_patterns AS p
    WHERE p.id = p_pattern_id AND p.club_id = actor_club AND NOT p.is_deleted
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pattern not found.' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.sessions AS s
    SET schedule_pattern_id = NULL,
        occurrence_date = NULL,
        event_type = 'training',
        min_players = NULL
    WHERE s.schedule_pattern_id = target_id
      AND s.club_id = actor_club
      AND s.starts_at >= now();

    UPDATE public.schedule_patterns AS p
    SET is_deleted = true,
        is_paused = true
    WHERE p.id = target_id;
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

REVOKE EXECUTE ON FUNCTION public.admin_list_patterns() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_sessions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_pattern_paused(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_pattern(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_patterns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_pattern_paused(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_pattern(uuid) TO authenticated;
