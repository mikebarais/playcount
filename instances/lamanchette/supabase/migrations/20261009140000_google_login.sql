-- Restricted to Google so an unverified email/password sign-up cannot claim a member's address.
CREATE POLICY "Google users can read their member row"
ON public.members
FOR SELECT
TO authenticated
USING (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
    AND lower(google_email) = lower((SELECT auth.jwt() ->> 'email'))
);

CREATE POLICY "Signed-in users can read club branding"
ON public.clubs
FOR SELECT
TO authenticated
USING (true);
