UPDATE public.clubs
SET theme = '{
    "page": "#ffffff",
    "banner": "#f2f7fc",
    "text": "#0b2a5b",
    "accent": "#1f6fc0",
    "shape": "#3aa0e0",
    "rule": "#0b2a5b"
}'::jsonb
WHERE name = 'La Manchette';
