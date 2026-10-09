---
name: PlayCount Generic Frontend
description: "Use when building or changing PlayCount frontend code, club branding, banners, schedules, or page metadata. Keeps the UI generic across per-club deployments and driven by Supabase data."
applyTo: ["src/**/*.jsx", "src/**/*.css", "index.html"]
---
# Generic Frontend Data

The frontend is shared across club deployments. The active deployment and its Supabase database determine the club content.

- Read the club name and banner from the deployment's `clubs` row; render `clubs.banner_message` as the club banner.
- Read schedules, venues, sessions, and other club-specific content from their corresponding database records.
- Keep JSX, CSS, HTML metadata, and default UI states free of club-specific names, locations, dates, and schedules.
- Keep loading, missing-data, and error states neutral; do not silently substitute La Manchette content or values from another deployment.
- Follow the active schema and query the records belonging to the club configured for this deployment.
