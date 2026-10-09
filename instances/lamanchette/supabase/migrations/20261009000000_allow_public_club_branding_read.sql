CREATE POLICY "Public can read club branding"
ON public.clubs
FOR SELECT
TO anon
USING (true);