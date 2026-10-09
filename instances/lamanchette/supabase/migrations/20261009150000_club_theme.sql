-- Keys map to frontend CSS variables: page, banner, text, accent, shape, rule.
ALTER TABLE public.clubs
ADD COLUMN theme jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.clubs
SET theme = '{
    "page": "#0e2140",
    "banner": "#16346a",
    "text": "#ffffff",
    "accent": "#6cc4f0",
    "shape": "#2a5db0",
    "rule": "#d4a94a"
}'::jsonb
WHERE name = 'La Manchette';
