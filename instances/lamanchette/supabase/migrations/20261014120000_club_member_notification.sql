ALTER TABLE public.clubs
ADD COLUMN notification_message text,
ADD COLUMN notification_expires_on date,
ADD CONSTRAINT clubs_notification_fields_check CHECK (
    (notification_message IS NULL AND notification_expires_on IS NULL)
    OR (
        notification_message IS NOT NULL
        AND length(trim(notification_message)) BETWEEN 1 AND 1000
        AND notification_expires_on IS NOT NULL
    )
);

CREATE FUNCTION public.admin_update_club_notification(
    p_message text,
    p_expires_on date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_club uuid := public.admin_club_id();
    normalized_message text := nullif(trim(coalesce(p_message, '')), '');
    club_timezone text;
BEGIN
    IF normalized_message IS NULL AND p_expires_on IS NULL THEN
        UPDATE public.clubs AS c
        SET notification_message = NULL,
            notification_expires_on = NULL
        WHERE c.id = actor_club;
        RETURN;
    END IF;

    IF normalized_message IS NULL OR p_expires_on IS NULL THEN
        RAISE EXCEPTION 'A notification message and expiration date are both required.' USING ERRCODE = '22023';
    END IF;
    IF length(normalized_message) > 1000 THEN
        RAISE EXCEPTION 'Notification must be 1000 characters or fewer.' USING ERRCODE = '22023';
    END IF;

    SELECT c.timezone INTO club_timezone
    FROM public.clubs AS c
    WHERE c.id = actor_club;

    IF p_expires_on < (now() AT TIME ZONE club_timezone)::date THEN
        RAISE EXCEPTION 'Expiration date cannot be in the past.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.clubs AS c
    SET notification_message = normalized_message,
        notification_expires_on = p_expires_on
    WHERE c.id = actor_club;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_club_notification(text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_club_notification(text, date) TO authenticated;
