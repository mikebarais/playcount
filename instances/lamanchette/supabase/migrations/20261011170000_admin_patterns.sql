CREATE FUNCTION public.admin_list_patterns()
RETURNS TABLE (
    id uuid,
    day_of_week smallint,
    "time" time,
    duration_minutes integer,
    location text,
    min_players integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.id, p.day_of_week, p."time", round(extract(epoch FROM p.duration) / 60)::integer,
           p.location, p.min_players
    FROM public.schedule_patterns AS p
    WHERE p.club_id = public.admin_club_id()
    ORDER BY p.day_of_week, p."time", p.id;
$$;

CREATE FUNCTION public.admin_create_pattern(
    p_day_of_week integer,
    p_time time,
    p_duration_minutes integer,
    p_location text,
    p_min_players integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_club uuid := public.admin_club_id();
    normalized_location text := trim(coalesce(p_location, ''));
    new_pattern_id uuid;
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

    INSERT INTO public.schedule_patterns (club_id, day_of_week, "time", duration, location, min_players)
    VALUES (actor_club, p_day_of_week, p_time, make_interval(mins => p_duration_minutes), normalized_location, p_min_players)
    RETURNING id INTO new_pattern_id;

    RETURN new_pattern_id;
END;
$$;

CREATE FUNCTION public.admin_update_pattern(
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

    UPDATE public.schedule_patterns AS p
    SET day_of_week = p_day_of_week,
        "time" = p_time,
        duration = make_interval(mins => p_duration_minutes),
        location = normalized_location,
        min_players = p_min_players
    WHERE p.id = p_pattern_id AND p.club_id = actor_club;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pattern not found.' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_patterns() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_pattern(integer, time, integer, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_pattern(uuid, integer, time, integer, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_patterns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_pattern(integer, time, integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_pattern(uuid, integer, time, integer, text, integer) TO authenticated;
