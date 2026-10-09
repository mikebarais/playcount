-- Exposes only names of players, never their personal links.
CREATE FUNCTION public.club_players()
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

REVOKE EXECUTE ON FUNCTION public.club_players() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_players() TO authenticated;

CREATE POLICY "Members can read attendances"
ON public.attendances
FOR SELECT
TO authenticated
USING ((SELECT public.is_member()));

CREATE POLICY "Players can add their own attendance"
ON public.attendances
FOR INSERT
TO authenticated
WITH CHECK (
    member_id = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.members
        WHERE id = (SELECT auth.uid()) AND is_player
    )
);

CREATE POLICY "Players can update their own attendance"
ON public.attendances
FOR UPDATE
TO authenticated
USING (member_id = (SELECT auth.uid()))
WITH CHECK (member_id = (SELECT auth.uid()));

CREATE POLICY "Members can read exceptional players"
ON public.exceptional_players
FOR SELECT
TO authenticated
USING ((SELECT public.is_member()));
