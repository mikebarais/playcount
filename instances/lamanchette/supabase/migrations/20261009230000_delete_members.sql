DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.members WHERE is_active = false) THEN
        RAISE EXCEPTION 'Delete deactivated members before applying the delete-only member migration.';
    END IF;
END;
$$;

DROP POLICY IF EXISTS "Google users can read their member row" ON public.members;
CREATE POLICY "Google users can read their member row"
ON public.members
FOR SELECT
TO authenticated
USING (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
    AND lower(google_email) = lower((SELECT auth.jwt() ->> 'email'))
);

DROP POLICY IF EXISTS "Active members can read their own row" ON public.members;
CREATE POLICY "Members can read their own row"
ON public.members
FOR SELECT
TO authenticated
USING (id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.is_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.members WHERE id = (SELECT auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.members
        WHERE id = (SELECT auth.uid()) AND is_admin
    );
$$;

CREATE OR REPLACE FUNCTION public.club_players()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT m.id, m.name
    FROM public.members AS m
    WHERE m.is_player AND public.is_member()
    ORDER BY m.name;
$$;

DROP FUNCTION public.admin_set_member_active(uuid, boolean);
DROP FUNCTION public.admin_list_members();

CREATE FUNCTION public.admin_list_members()
RETURNS TABLE (
    member_id uuid,
    name text,
    google_email text,
    personal_link uuid,
    is_player boolean,
    is_admin boolean
)
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

    RETURN QUERY
    SELECT m.id, m.name, m.google_email, m.personal_link, m.is_player, m.is_admin
    FROM public.members AS m
    WHERE m.club_id = actor_club
    ORDER BY m.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_member(
    p_member_id uuid,
    p_name text,
    p_google_email text,
    p_is_player boolean,
    p_is_admin boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.admin_create_member(
    p_name text,
    p_google_email text,
    p_is_player boolean,
    p_is_admin boolean
)
RETURNS TABLE (member_id uuid, personal_link uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.admin_regenerate_personal_link(p_member_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE FUNCTION public.admin_delete_member(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

ALTER TABLE public.members DROP COLUMN is_active;

REVOKE EXECUTE ON FUNCTION public.admin_list_members() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_member(uuid) TO authenticated;
