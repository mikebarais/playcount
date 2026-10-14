


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."admin_add_exceptional_player"("p_session_id" "uuid", "p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_add_exceptional_player"("p_session_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_club_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_club_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_member"("p_name" "text", "p_google_email" "text", "p_is_player" boolean, "p_is_admin" boolean) RETURNS TABLE("member_id" "uuid", "personal_link" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    actor_club uuid;
    created_member public.members%ROWTYPE;
    normalized_name text := trim(coalesce(p_name, ''));
    normalized_email text := nullif(lower(trim(coalesce(p_google_email, ''))), '');
BEGIN
    SELECT m.club_id INTO actor_club
    FROM public.members AS m
    WHERE m.id = (SELECT auth.uid()) AND m.is_admin;

    IF actor_club IS NULL THEN
        RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
    END IF;
    IF length(normalized_name) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'Name must be between 1 and 120 characters.' USING ERRCODE = '22023';
    END IF;
    IF normalized_email IS NOT NULL AND length(normalized_email) > 254 THEN
        RAISE EXCEPTION 'Email must be 254 characters or fewer.' USING ERRCODE = '22023';
    END IF;
    IF p_is_player IS NULL OR p_is_admin IS NULL
       OR (NOT p_is_player AND NOT p_is_admin) THEN
        RAISE EXCEPTION 'A member must have at least one role.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.members (club_id, name, google_email, is_player, is_admin)
    VALUES (actor_club, normalized_name, normalized_email, p_is_player, p_is_admin)
    RETURNING * INTO created_member;

    RETURN QUERY SELECT created_member.id, created_member.personal_link;
END;
$$;


ALTER FUNCTION "public"."admin_create_member"("p_name" "text", "p_google_email" "text", "p_is_player" boolean, "p_is_admin" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_pattern"("p_day_of_week" integer, "p_time" time without time zone, "p_duration_minutes" integer, "p_location" "text", "p_min_players" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_create_pattern"("p_day_of_week" integer, "p_time" time without time zone, "p_duration_minutes" integer, "p_location" "text", "p_min_players" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_session"("p_local_date" "date", "p_start_time" time without time zone, "p_duration" interval, "p_location" "text", "p_event_description" "text", "p_event_type" "text", "p_min_players" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_create_session"("p_local_date" "date", "p_start_time" time without time zone, "p_duration" interval, "p_location" "text", "p_event_description" "text", "p_event_type" "text", "p_min_players" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_exceptional_session"("p_session_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_delete_exceptional_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_member"("p_member_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    actor_club uuid;
    target_member public.members%ROWTYPE;
BEGIN
    SELECT m.club_id INTO actor_club
    FROM public.members AS m
    WHERE m.id = (SELECT auth.uid()) AND m.is_admin;

    IF actor_club IS NULL THEN
        RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
    END IF;

    SELECT m.* INTO target_member
    FROM public.members AS m
    WHERE m.id = p_member_id AND m.club_id = actor_club
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member was not found.' USING ERRCODE = 'P0002';
    END IF;
    IF p_member_id = (SELECT auth.uid()) THEN
        RAISE EXCEPTION 'You cannot delete your own account.' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.members AS m
    WHERE m.id = p_member_id AND m.club_id = actor_club;
END;
$$;


ALTER FUNCTION "public"."admin_delete_member"("p_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_pattern"("p_pattern_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_delete_pattern"("p_pattern_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_members"() RETURNS TABLE("member_id" "uuid", "name" "text", "google_email" "text", "personal_link" "uuid", "is_player" boolean, "is_admin" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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

    RETURN QUERY
    SELECT m.id, m.name, m.google_email, m.personal_link, m.is_player, m.is_admin
    FROM public.members AS m
    WHERE m.club_id = actor_club
    ORDER BY m.name;
END;
$$;


ALTER FUNCTION "public"."admin_list_members"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_patterns"() RETURNS TABLE("id" "uuid", "day_of_week" smallint, "time" time without time zone, "duration_minutes" integer, "location" "text", "min_players" integer, "is_paused" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT p.id, p.day_of_week, p."time", round(extract(epoch FROM p.duration) / 60)::integer,
           p.location, p.min_players, p.is_paused
    FROM public.schedule_patterns AS p
    WHERE p.club_id = public.admin_club_id() AND NOT p.is_deleted
    ORDER BY p.day_of_week, p."time", p.id;
$$;


ALTER FUNCTION "public"."admin_list_patterns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_sessions"() RETURNS TABLE("session_id" "uuid", "local_date" "date", "local_time" time without time zone, "duration" interval, "location" "text", "min_players" integer, "status" "text", "cancellation_reason" "text", "event_description" "text", "event_type" "text", "is_exceptional" boolean, "guests" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_list_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_regenerate_personal_link"("p_member_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    actor_club uuid;
    new_link uuid;
BEGIN
    SELECT m.club_id INTO actor_club
    FROM public.members AS m
    WHERE m.id = (SELECT auth.uid()) AND m.is_admin;

    IF actor_club IS NULL THEN
        RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
    END IF;
    IF p_member_id = (SELECT auth.uid()) THEN
        RAISE EXCEPTION 'You cannot regenerate your own active personal link.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.members AS m
    SET personal_link = gen_random_uuid()
    WHERE m.id = p_member_id AND m.club_id = actor_club
    RETURNING m.personal_link INTO new_link;

    IF new_link IS NULL THEN
        RAISE EXCEPTION 'Member was not found.' USING ERRCODE = 'P0002';
    END IF;

    RETURN new_link;
END;
$$;


ALTER FUNCTION "public"."admin_regenerate_personal_link"("p_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_remove_exceptional_player"("p_player_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_remove_exceptional_player"("p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_pattern_paused"("p_pattern_id" "uuid", "p_paused" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_set_pattern_paused"("p_pattern_id" "uuid", "p_paused" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_session_cancelled"("p_session_id" "uuid", "p_cancelled" boolean, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_set_session_cancelled"("p_session_id" "uuid", "p_cancelled" boolean, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_member"("p_member_id" "uuid", "p_name" "text", "p_google_email" "text", "p_is_player" boolean, "p_is_admin" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    actor_club uuid;
    target_member public.members%ROWTYPE;
    normalized_name text := trim(coalesce(p_name, ''));
    normalized_email text := nullif(lower(trim(coalesce(p_google_email, ''))), '');
BEGIN
    SELECT m.club_id INTO actor_club
    FROM public.members AS m
    WHERE m.id = (SELECT auth.uid()) AND m.is_admin;

    IF actor_club IS NULL THEN
        RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
    END IF;
    IF length(normalized_name) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'Name must be between 1 and 120 characters.' USING ERRCODE = '22023';
    END IF;
    IF normalized_email IS NOT NULL AND length(normalized_email) > 254 THEN
        RAISE EXCEPTION 'Email must be 254 characters or fewer.' USING ERRCODE = '22023';
    END IF;
    IF p_is_player IS NULL OR p_is_admin IS NULL
       OR (NOT p_is_player AND NOT p_is_admin) THEN
        RAISE EXCEPTION 'A member must have at least one role.' USING ERRCODE = '22023';
    END IF;

    SELECT m.* INTO target_member
    FROM public.members AS m
    WHERE m.id = p_member_id AND m.club_id = actor_club
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member was not found.' USING ERRCODE = 'P0002';
    END IF;
    IF p_member_id = (SELECT auth.uid()) AND NOT p_is_admin THEN
        RAISE EXCEPTION 'You cannot remove your own administrator role.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.members AS m
    SET name = normalized_name,
        google_email = normalized_email,
        is_player = p_is_player,
        is_admin = p_is_admin
    WHERE m.id = p_member_id AND m.club_id = actor_club;
END;
$$;


ALTER FUNCTION "public"."admin_update_member"("p_member_id" "uuid", "p_name" "text", "p_google_email" "text", "p_is_player" boolean, "p_is_admin" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_pattern"("p_pattern_id" "uuid", "p_day_of_week" integer, "p_time" time without time zone, "p_duration_minutes" integer, "p_location" "text", "p_min_players" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_update_pattern"("p_pattern_id" "uuid", "p_day_of_week" integer, "p_time" time without time zone, "p_duration_minutes" integer, "p_location" "text", "p_min_players" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_session"("p_session_id" "uuid", "p_start_time" time without time zone, "p_location" "text", "p_min_players" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_update_session"("p_session_id" "uuid", "p_start_time" time without time zone, "p_location" "text", "p_min_players" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."club_players"() RETURNS TABLE("id" "uuid", "name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT m.id, m.name
    FROM public.members AS m
    WHERE m.is_player AND public.is_member()
    ORDER BY m.name;
$$;


ALTER FUNCTION "public"."club_players"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_upcoming_sessions"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."ensure_upcoming_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.members
        WHERE id = (SELECT auth.uid()) AND is_admin
    );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT EXISTS (SELECT 1 FROM public.members WHERE id = (SELECT auth.uid()));
$$;


ALTER FUNCTION "public"."is_member"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."attendances" (
    "session_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    CONSTRAINT "attendances_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'uncertain'::"text", 'absent'::"text"])))
);


ALTER TABLE "public"."attendances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "banner_message" "text",
    "theme" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "logo_path" "text",
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL
);


ALTER TABLE "public"."clubs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exceptional_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."exceptional_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "google_email" "text",
    "personal_link" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_player" boolean NOT NULL,
    "is_admin" boolean NOT NULL,
    CONSTRAINT "members_check" CHECK (("is_player" OR "is_admin"))
);


ALTER TABLE "public"."members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_patterns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" NOT NULL,
    "day_of_week" smallint NOT NULL,
    "time" time without time zone NOT NULL,
    "duration" interval NOT NULL,
    "location" "text" NOT NULL,
    "min_players" integer NOT NULL,
    "is_paused" boolean DEFAULT false NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    CONSTRAINT "schedule_patterns_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "schedule_patterns_duration_check" CHECK (("duration" > '00:00:00'::interval)),
    CONSTRAINT "schedule_patterns_min_players_check" CHECK (("min_players" > 0))
);


ALTER TABLE "public"."schedule_patterns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" NOT NULL,
    "schedule_pattern_id" "uuid",
    "starts_at" timestamp with time zone NOT NULL,
    "duration" interval NOT NULL,
    "location" "text" NOT NULL,
    "min_players" integer,
    "event_description" "text",
    "event_type" "text" DEFAULT 'regular'::"text" NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "cancellation_reason" "text",
    "occurrence_date" "date",
    CONSTRAINT "sessions_check1" CHECK ((("schedule_pattern_id" IS NOT NULL) OR ("event_description" IS NOT NULL) OR ("event_type" IS NOT NULL))),
    CONSTRAINT "sessions_duration_check" CHECK (("duration" > '00:00:00'::interval)),
    CONSTRAINT "sessions_event_type_matches_pattern" CHECK (((("schedule_pattern_id" IS NOT NULL) AND ("event_type" = 'regular'::"text")) OR (("schedule_pattern_id" IS NULL) AND ("event_type" <> 'regular'::"text")))),
    CONSTRAINT "sessions_min_players_check" CHECK ((("min_players" IS NULL) OR ("min_players" > 0))),
    CONSTRAINT "sessions_occurrence_requires_pattern" CHECK ((("occurrence_date" IS NULL) OR ("schedule_pattern_id" IS NOT NULL))),
    CONSTRAINT "sessions_regular_min_players_required" CHECK ((("schedule_pattern_id" IS NULL) OR ("min_players" IS NOT NULL))),
    CONSTRAINT "sessions_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_pkey" PRIMARY KEY ("session_id", "member_id");



ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exceptional_players"
    ADD CONSTRAINT "exceptional_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_google_email_key" UNIQUE ("google_email");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_personal_link_key" UNIQUE ("personal_link");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_patterns"
    ADD CONSTRAINT "schedule_patterns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pattern_occurrence_key" UNIQUE ("schedule_pattern_id", "occurrence_date");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exceptional_players"
    ADD CONSTRAINT "exceptional_players_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_patterns"
    ADD CONSTRAINT "schedule_patterns_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_schedule_pattern_id_fkey" FOREIGN KEY ("schedule_pattern_id") REFERENCES "public"."schedule_patterns"("id");



CREATE POLICY "Google users can read their member row" ON "public"."members" FOR SELECT TO "authenticated" USING (((( SELECT (("auth"."jwt"() -> 'app_metadata'::"text") ->> 'provider'::"text")) = 'google'::"text") AND ("lower"("google_email") = "lower"(( SELECT ("auth"."jwt"() ->> 'email'::"text"))))));



CREATE POLICY "Members can read attendances" ON "public"."attendances" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_member"() AS "is_member"));



CREATE POLICY "Members can read exceptional players" ON "public"."exceptional_players" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_member"() AS "is_member"));



CREATE POLICY "Members can read schedule patterns" ON "public"."schedule_patterns" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_member"() AS "is_member"));



CREATE POLICY "Members can read sessions" ON "public"."sessions" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_member"() AS "is_member"));



CREATE POLICY "Members can read their own row" ON "public"."members" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Players can add their own attendance" ON "public"."attendances" FOR INSERT TO "authenticated" WITH CHECK ((("member_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."is_member"() AS "is_member") AND (EXISTS ( SELECT 1
   FROM "public"."members"
  WHERE (("members"."id" = ( SELECT "auth"."uid"() AS "uid")) AND "members"."is_player")))));



CREATE POLICY "Players can update their own attendance" ON "public"."attendances" FOR UPDATE TO "authenticated" USING ((("member_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."is_member"() AS "is_member"))) WITH CHECK ((("member_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."is_member"() AS "is_member") AND (EXISTS ( SELECT 1
   FROM "public"."members"
  WHERE (("members"."id" = ( SELECT "auth"."uid"() AS "uid")) AND "members"."is_player")))));



CREATE POLICY "Public can read club branding" ON "public"."clubs" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Signed-in users can read club branding" ON "public"."clubs" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."attendances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clubs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exceptional_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_patterns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."admin_add_exceptional_player"("p_session_id" "uuid", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_add_exceptional_player"("p_session_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_add_exceptional_player"("p_session_id" "uuid", "p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_club_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_club_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_club_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_member"("p_name" "text", "p_google_email" "text", "p_is_player" boolean, "p_is_admin" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_member"("p_name" "text", "p_google_email" "text", "p_is_player" boolean, "p_is_admin" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_member"("p_name" "text", "p_google_email" "text", "p_is_player" boolean, "p_is_admin" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_pattern"("p_day_of_week" integer, "p_time" time without time zone, "p_duration_minutes" integer, "p_location" "text", "p_min_players" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_pattern"("p_day_of_week" integer, "p_time" time without time zone, "p_duration_minutes" integer, "p_location" "text", "p_min_players" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_pattern"("p_day_of_week" integer, "p_time" time without time zone, "p_duration_minutes" integer, "p_location" "text", "p_min_players" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_session"("p_local_date" "date", "p_start_time" time without time zone, "p_duration" interval, "p_location" "text", "p_event_description" "text", "p_event_type" "text", "p_min_players" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_session"("p_local_date" "date", "p_start_time" time without time zone, "p_duration" interval, "p_location" "text", "p_event_description" "text", "p_event_type" "text", "p_min_players" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_session"("p_local_date" "date", "p_start_time" time without time zone, "p_duration" interval, "p_location" "text", "p_event_description" "text", "p_event_type" "text", "p_min_players" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_exceptional_session"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_exceptional_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_exceptional_session"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_member"("p_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_member"("p_member_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_member"("p_member_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_pattern"("p_pattern_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_pattern"("p_pattern_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_pattern"("p_pattern_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_members"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_members"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_patterns"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_patterns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_patterns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_sessions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_sessions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_regenerate_personal_link"("p_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_regenerate_personal_link"("p_member_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_regenerate_personal_link"("p_member_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_remove_exceptional_player"("p_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_remove_exceptional_player"("p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_remove_exceptional_player"("p_player_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_pattern_paused"("p_pattern_id" "uuid", "p_paused" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_pattern_paused"("p_pattern_id" "uuid", "p_paused" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_pattern_paused"("p_pattern_id" "uuid", "p_paused" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_session_cancelled"("p_session_id" "uuid", "p_cancelled" boolean, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_session_cancelled"("p_session_id" "uuid", "p_cancelled" boolean, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_session_cancelled"("p_session_id" "uuid", "p_cancelled" boolean, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_member"("p_member_id" "uuid", "p_name" "text", "p_google_email" "text", "p_is_player" boolean, "p_is_admin" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_member"("p_member_id" "uuid", "p_name" "text", "p_google_email" "text", "p_is_player" boolean, "p_is_admin" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_member"("p_member_id" "uuid", "p_name" "text", "p_google_email" "text", "p_is_player" boolean, "p_is_admin" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_pattern"("p_pattern_id" "uuid", "p_day_of_week" integer, "p_time" time without time zone, "p_duration_minutes" integer, "p_location" "text", "p_min_players" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_pattern"("p_pattern_id" "uuid", "p_day_of_week" integer, "p_time" time without time zone, "p_duration_minutes" integer, "p_location" "text", "p_min_players" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_pattern"("p_pattern_id" "uuid", "p_day_of_week" integer, "p_time" time without time zone, "p_duration_minutes" integer, "p_location" "text", "p_min_players" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_session"("p_session_id" "uuid", "p_start_time" time without time zone, "p_location" "text", "p_min_players" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_session"("p_session_id" "uuid", "p_start_time" time without time zone, "p_location" "text", "p_min_players" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_session"("p_session_id" "uuid", "p_start_time" time without time zone, "p_location" "text", "p_min_players" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."club_players"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."club_players"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."club_players"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_upcoming_sessions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_upcoming_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_upcoming_sessions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_member"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member"() TO "service_role";


















GRANT ALL ON TABLE "public"."attendances" TO "anon";
GRANT ALL ON TABLE "public"."attendances" TO "authenticated";
GRANT ALL ON TABLE "public"."attendances" TO "service_role";



GRANT ALL ON TABLE "public"."clubs" TO "anon";
GRANT ALL ON TABLE "public"."clubs" TO "authenticated";
GRANT ALL ON TABLE "public"."clubs" TO "service_role";



GRANT ALL ON TABLE "public"."exceptional_players" TO "anon";
GRANT ALL ON TABLE "public"."exceptional_players" TO "authenticated";
GRANT ALL ON TABLE "public"."exceptional_players" TO "service_role";



GRANT ALL ON TABLE "public"."members" TO "anon";
GRANT ALL ON TABLE "public"."members" TO "authenticated";
GRANT ALL ON TABLE "public"."members" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_patterns" TO "anon";
GRANT ALL ON TABLE "public"."schedule_patterns" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_patterns" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

WITH seeded_club AS (
    INSERT INTO public.clubs (name, theme, timezone)
    VALUES (
        'La Manchette',
        '{
            "page": "#ffffff",
            "banner": "#f2f7fc",
            "text": "#0b2a5b",
            "accent": "#1f6fc0",
            "shape": "#3aa0e0",
            "rule": "#0b2a5b"
        }'::jsonb,
        'Europe/Brussels'
    )
    RETURNING id
)
INSERT INTO public.members (club_id, name, google_email, is_player, is_admin)
SELECT id, 'Maximilian Barais', 'mikebarais@gmail.com', false, true
FROM seeded_club;
