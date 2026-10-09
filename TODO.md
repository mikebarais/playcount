# TODO

## Personal-Link Name Display

- Rotate the admin personal link that was shared in chat before enabling this flow.
- Support the route `/p/<personal-link>` and keep the token in the path while the page is open.
- Resolve the token to a member's name through a narrow Supabase RPC; return only the name and do not expose member rows or credentials.
- Display a greeting using the resolved name. Invalid or unknown links should show a neutral error state.
- Keep this as identity/name display only. It does not authenticate the member or grant access to member data or admin actions.
- Ensure Cloudflare Workers serves the SPA for direct navigation and refreshes on `/p/<personal-link>`.
- Verify the valid admin link, invalid token, missing token, and direct page refresh behavior.