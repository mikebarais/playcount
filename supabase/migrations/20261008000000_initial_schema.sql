CREATE TABLE public.clubs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    timezone text NOT NULL,
    banner_message text
);

CREATE TABLE public.admins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    name text NOT NULL,
    google_email text UNIQUE,
    personal_link text NOT NULL UNIQUE
);

CREATE TABLE public.players (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    name text NOT NULL,
    google_email text UNIQUE,
    personal_link text NOT NULL UNIQUE
);

CREATE TABLE public.schedule_patterns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    "time" time without time zone NOT NULL,
    duration interval NOT NULL CHECK (duration > interval '0'),
    location text NOT NULL,
    min_players integer NOT NULL CHECK (min_players > 0)
);

CREATE TABLE public.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    schedule_pattern_id uuid REFERENCES public.schedule_patterns(id),
    starts_at timestamp with time zone NOT NULL,
    duration interval NOT NULL CHECK (duration > interval '0'),
    location text NOT NULL,
    min_players integer CHECK (min_players IS NULL OR min_players > 0),
    event_name text,
    event_type text,
    status text NOT NULL DEFAULT 'planifiée'
        CHECK (status IN ('planifiée', 'annulée')),
    cancellation_reason text,
    CHECK (schedule_pattern_id IS NOT NULL OR min_players IS NOT NULL),
    CHECK (
        schedule_pattern_id IS NOT NULL
        OR event_name IS NOT NULL
        OR event_type IS NOT NULL
    )
);

CREATE TABLE public.attendances (
    session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('Présent', 'Incertain', 'Absent')),
    PRIMARY KEY (session_id, player_id)
);

CREATE TABLE public.exceptional_players (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    name text NOT NULL
);

WITH seeded_club AS (
    INSERT INTO public.clubs (name, timezone)
    VALUES ('La Manchette', 'Europe/Brussels')
    RETURNING id
), seeded_admin AS (
    INSERT INTO public.admins (club_id, name, google_email, personal_link)
    SELECT id, 'Maximilian Barais', 'mikebarais@gmail.com', gen_random_uuid()::text
    FROM seeded_club
    RETURNING club_id
)
INSERT INTO public.schedule_patterns (
    club_id,
    day_of_week,
    "time",
    duration,
    location,
    min_players
)
SELECT club_id, 6, TIME '10:00', INTERVAL '2 hours', 'Centre sportif de Blocry', 8
FROM seeded_admin;

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exceptional_players ENABLE ROW LEVEL SECURITY;