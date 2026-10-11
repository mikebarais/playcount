-- Returns the caller's club when they are an administrator; raises otherwise.
CREATE FUNCTION public.admin_club_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_club uuid;
BEGIN
    SELECT m.club_id INTO actor_club
    FROM public.members AS m
    WHERE m.id = (SELECT auth.uid()) AND m.is_admin;

    IF actor_club IS NULL THEN
        RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
    END IF;

    RETURN actor_club;
END;
$$;

-- Upcoming pattern sessions (today + 27 days); dates and times are in the pattern's timezone.
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
        (s.starts_at AT TIME ZONE p.timezone)::date,
        (s.starts_at AT TIME ZONE p.timezone)::time,
        s.duration,
        s.location,
        s.min_players,
        p.min_players,
        s.status,
        s.cancellation_reason,
        coalesce(
            (
                SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
                FROM public.exceptional_players AS g
                WHERE g.session_id = s.id
            ),
            '[]'::jsonb
        )
    FROM public.sessions AS s
    JOIN public.schedule_patterns AS p ON p.id = s.schedule_pattern_id
    WHERE s.club_id = actor_club
      AND s.occurrence_date BETWEEN (now() AT TIME ZONE p.timezone)::date
                                AND (now() AT TIME ZONE p.timezone)::date + 27
    ORDER BY s.starts_at;
END;
$$;

-- The time applies to the session's own date in its pattern's timezone; a null minimum restores the pattern default.
CREATE FUNCTION public.admin_update_session(
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

    UPDATE public.sessions AS s
    SET starts_at = (s.occurrence_date + p_start_time) AT TIME ZONE p.timezone,
        location = normalized_location,
        min_players = p_min_players
    FROM public.schedule_patterns AS p
    WHERE s.id = p_session_id
      AND s.club_id = actor_club
      AND p.id = s.schedule_pattern_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session was not found.' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

CREATE FUNCTION public.admin_set_session_cancelled(
    p_session_id uuid,
    p_cancelled boolean,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_club uuid := public.admin_club_id();
    normalized_reason text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
    IF p_cancelled IS NULL THEN
        RAISE EXCEPTION 'Session status is required.' USING ERRCODE = '22023';
    END IF;
    IF length(normalized_reason) > 300 THEN
        RAISE EXCEPTION 'Reason must be 300 characters or fewer.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.sessions AS s
    SET status = CASE WHEN p_cancelled THEN 'cancelled' ELSE 'scheduled' END,
        cancellation_reason = CASE WHEN p_cancelled THEN normalized_reason END
    WHERE s.id = p_session_id AND s.club_id = actor_club;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session was not found.' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

CREATE FUNCTION public.admin_add_exceptional_player(p_session_id uuid, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_club uuid := public.admin_club_id();
    normalized_name text := trim(coalesce(p_name, ''));
    new_player_id uuid;
BEGIN
    IF length(normalized_name) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'Name must be between 1 and 120 characters.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.sessions AS s
        WHERE s.id = p_session_id AND s.club_id = actor_club
    ) THEN
        RAISE EXCEPTION 'Session was not found.' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.exceptional_players (session_id, name)
    VALUES (p_session_id, normalized_name)
    RETURNING id INTO new_player_id;

    RETURN new_player_id;
END;
$$;

CREATE FUNCTION public.admin_remove_exceptional_player(p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_club uuid := public.admin_club_id();
BEGIN
    DELETE FROM public.exceptional_players AS g
    USING public.sessions AS s
    WHERE g.id = p_player_id
      AND s.id = g.session_id
      AND s.club_id = actor_club;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exceptional player was not found.' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_club_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_sessions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_session(uuid, time, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_session_cancelled(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_add_exceptional_player(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_remove_exceptional_player(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_club_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_session(uuid, time, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_session_cancelled(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_exceptional_player(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_exceptional_player(uuid) TO authenticated;
