CREATE POLICY "Members can read their own row"
ON public.members
FOR SELECT
TO authenticated
USING (id = (SELECT auth.uid()));
