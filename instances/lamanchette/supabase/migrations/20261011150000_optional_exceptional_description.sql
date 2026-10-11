CREATE OR REPLACE FUNCTION public.admin_create_session(
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
    normalized_description text := nullif(trim(coalesce(p_event_name, '')), '');
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
        event_name,
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
