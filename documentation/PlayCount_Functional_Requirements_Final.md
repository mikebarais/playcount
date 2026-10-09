# PlayCount - Functional Requirements Specification

Final functional design, consolidated from the agreed requirements and subsequent changes.

## 1. Product Overview

PlayCount is a mobile-first web application for sports clubs. It allows players to see upcoming sessions and declare their attendance, while club administrators manage schedules, exceptional events, players, administrators, and attendance.

Each club uses its own application deployment and Supabase project.

## 2. User Roles

### 2.1 Player

- Can access the application through a personal direct link. Google sign-in is preferred when the player's Google identity is associated with their profile.
- A player does not need a Google identity; an administrator can add the player by name and share the generated personal link.
- Can see upcoming sessions for the club.
- Can set and change their own attendance status for each session.
- Can only manage their own attendance information.
- Cannot add guests or other participants.

### 2.2 Administrator

- Can access the application through a personal direct link or Google sign-in when a Google identity is associated with the admin profile.
- A Google identity is optional for an administrator; an administrator without one signs in using their personal direct link.
- Can manage the club configuration and recurring schedule.
- Can create, modify, and cancel sessions.
- Can create exceptional training sessions or matches that do not follow the recurring weekly pattern.
- Can manage players and administrators.
- Can view the personal access links of all players in the club.
- Can add exceptional participants/guests to a specific session. These people do not have a login.
- Can add, modify, and remove exceptional participants for a session.

## 3. Authentication and Access

- A personal direct link contains a secure token and provides access without requiring Google sign-in.
- Players can use Google sign-in only when their Google identity is associated with their player profile. After successful Google sign-in, the browser redirects to that player's personal direct link.
- Players without an associated Google identity use their personal link, which an administrator can share with them.
- Administrators can use their personal admin link whether or not they have a Google identity. An admin with an associated Google identity can also sign in with Google.
- After successful Google sign-in for an admin, the browser redirects to that admin's personal admin link.
- Admin personal links and player personal links are distinct: an admin link grants admin permissions, while a player link grants access only to that player's own attendance.
- Administrators can view and share players' personal links when needed.
- The root page and unrecognized personal links show a Google sign-in option.
- Google sign-in uses the Supabase Auth Google provider. The signed-in Google email is matched case-insensitively against the member row's `google_email`; row-level security exposes that row only to Google-authenticated sessions.
- A Google account with no matching member sees that it is not registered and can switch accounts.
- Google sign-in and personal links resolve to the same corresponding account and permissions.

## 4. Club Configuration and Deployment

- Each club has its own name, recurring schedules, players, administrators, and announcement/banner.
- Each club has its own Cloudflare Worker deployment and Supabase project.
- The frontend derives the club instance slug from the first hostname label. For example, `lamanchette.playcount.workers.dev` selects `lamanchette`.
- The frontend loads `public/instances/<slug>.json` to obtain that instance's Supabase URL and publishable API key. Local development can select an instance with `VITE_DEFAULT_INSTANCE` or an `instance` query parameter.
- Club name and banner content come from the selected Supabase project's `clubs` row; the shared frontend contains no club-specific branding or venue values.
- The application is generic and must not contain club-specific functional logic such as assuming that all sessions occur on Saturday.
- Each club has its own Cloudflare `workers.dev` hostname; a purchased custom domain is not required.

## 5. Recurring Schedule

- A club can define one or more recurring weekly session patterns.
- Each pattern contains the day of week, default time, default duration, and default location.
- Each pattern has its own minimum required number of participants.
- The application automatically generates upcoming sessions from these recurring patterns.
- When a member opens the application, any missing pattern sessions from today through the next 4 weeks are created, in each pattern's timezone. The member then sees at most 6 sessions (recurring and exceptional) in that window, including cancelled ones.
- Each generated session records the pattern date it was created for (`occurrence_date`), so a per-date override or cancellation never causes that date to be generated again.
- The upcoming sessions are ordered chronologically.
- The system must support different patterns for the same club, for example Thursday and Saturday sessions.
- The interface must use dynamic dates and session information rather than hard-coded wording such as "Saturday".

## 6. Exceptional Sessions

- An administrator can manually create an exceptional session.
- An exceptional session can be a training session, match, or other relevant sporting event.
- An exceptional session does not need to follow any recurring weekly pattern.
- The administrator defines at least the date, time, duration, location, and session/event type or name.
- Exceptional sessions appear in the same chronological session list as recurring sessions.
- They use the same attendance/RSVP mechanism as regular sessions.
- Exceptional sessions can subsequently be modified or cancelled by an administrator.

## 7. Session Exceptions and Cancellation

- For a generated recurring session, an administrator can override the default time for that specific date.
- For a generated recurring session, an administrator can override the default duration for that specific date.
- For a generated recurring session, an administrator can override the default location for that specific date.
- An administrator can cancel an individual session.
- A cancelled session can have a cancellation reason.
- Cancellation affects the individual session only and does not change the recurring weekly pattern.

## 8. Attendance / RSVP

- For each upcoming session, a registered player can select one of three statuses: present, uncertain, or absent.
- The player can change their response later.
- The player's response is associated with the specific session.
- A player cannot add guests to their response.
- Attendance information is visible in the session attendance view.
- The current interface uses a checkbox per session: checked stores `present`, unchecked stores `absent`. `uncertain` is not yet selectable.
- Status values are stored as English codes (`present`, `uncertain`, `absent`; sessions `scheduled`, `cancelled`). The interface is English only for now; display text will later be translated.

## 9. Exceptional Participants / Guests

- Only an administrator can add exceptional participants to a session.
- Exceptional participants are not registered club players.
- Exceptional participants do not have a login, personal link, or Google account association.
- An administrator can add one or more exceptional participants to a specific session.
- Exceptional participants are displayed distinctly from registered players.
- Their participation contributes to the total participant count for that session.
- The administrator can modify or remove exceptional participants from the session.

## 10. Minimum Participation and Viability

- Each recurring schedule pattern has its own configurable minimum number of participants.
- A session uses its schedule pattern's minimum unless a session-specific minimum is set. An exceptional session without a recurring pattern must define its own minimum.
- The application calculates the total confirmed participants for a session from registered players marked present plus exceptional participants added by the administrator.
- The session view displays the current total against that session's minimum.
- A visual progress indicator shows whether the minimum threshold has been reached.

## 11. Main Attendance Interface

The principal attendance view is a chronological attendance matrix designed for efficient use on a phone and, where appropriate, on larger screens.

- Columns represent sessions/events, sorted by date from earliest to latest.
- The session columns can be scrolled horizontally.
- The player name column stays fixed while scrolling; on any screen width at least the names and one session column are visible.
- Each player can edit only their own cells; all other cells, and cells of cancelled sessions, are read-only.
- When the page opens, horizontal scrolling is positioned on the next upcoming session.
- Rows represent registered players.
- Each player/session cell displays the player's current attendance status.
- Exceptional participants added by an administrator are displayed as separate participant rows and are visually distinguishable from registered players.
- The matrix allows the administrator to see multiple future sessions and the attendance status of all players in one view.
- The same underlying attendance information is used by the player-facing view, while players only control their own status.

## 12. Real-Time Attendance Information

- The attendance roster updates dynamically when player responses change.
- The session total and minimum-participation indicator reflect the current attendance data.
- Administrators can see the current attendance state across upcoming sessions.

## 13. Club Administration

- Administrator can configure the club name.
- Administrator can configure the minimum required number of participants for each recurring schedule pattern.
- Administrator can add, modify, or remove recurring weekly session patterns.
- Administrator can configure the default time and location for each recurring pattern.
- Administrator can create exceptional sessions/events.
- Administrator can modify or cancel sessions.
- Administrator can manage the club's players.
- Administrator can manage other club administrators.
- Administrator can manage the club announcement/banner.
- Administrator can view players' personal direct links.

## 14. Club Announcement / Banner

- A club administrator can define an announcement message.
- The announcement is displayed prominently in the player-facing session view.
- The announcement is associated with the club rather than with an individual player.
- Each club defines its color theme in the `clubs.theme` row (`page`, `banner`, `text`, `accent`, `shape`, `rule` hex colors); the frontend applies it and falls back to neutral defaults.
- A club can have a logo, stored in the public `branding` storage bucket and referenced by `clubs.logo_path`. Signed-in members see it in the banner corner.

## 15. Administrator Management

- A club can have multiple administrators.
- An administrator has a separate Administration area for member management, apart from the attendance interface.
- An administrator can create a member with a name, optional Google email, and player/admin roles; the database generates a unique UUID personal link.
- An administrator can view the member list and copy personal links, edit a member's name, email, and roles, regenerate a member's link, and deactivate or reactivate a member.
- Every member change is staged and requires explicit confirmation before it is sent to the database.
- Regenerating a link blocks future personal-link exchanges; already-issued sessions remain valid until their one-hour expiry.
- Deactivation blocks new personal-link sessions and member data access while preserving historical attendance. An administrator cannot deactivate themself, remove their own admin role, or remove the last active administrator.
- A Google identity/email can optionally be associated with a member profile for Google sign-in.
- Administrators have elevated permissions for their club only.

## 16. Functional Data Model

| Entity | Purpose | Key functional information |
| --- | --- | --- |
| Club | Club configuration | Name, announcement, color theme, logo |
| Recurring Schedule | Weekly pattern | Day, time, timezone, duration, location, minimum participants |
| Member | Club identity | Name, personal link, optional Google identity, player/admin roles |
| Session | Concrete event | Date/time, duration, location, optional minimum override, planned/cancelled, cancellation reason, regular/exceptional |
| Attendance | Member response | Session, member, present/uncertain/absent |
| Exceptional Player | Admin-added participant | Session and name; participation is implicit; no login |

### Draft Supabase Schema

Each club deployment contains one club configuration. Google sign-in (Supabase Auth Google provider) matches member records by their Google email.

```mermaid
erDiagram
	CLUBS {
		uuid id PK
		text name
		text banner_message
		jsonb theme
		text logo_path
	}

	MEMBERS {
		uuid id PK
		uuid club_id FK
		text name
		text google_email UK "nullable verified Google email"
		uuid personal_link UK "database-generated bearer link"
		boolean is_player
		boolean is_admin
		boolean is_active
	}

	SCHEDULE_PATTERNS {
		uuid id PK
		uuid club_id FK
		smallint day_of_week "0 Sunday through 6 Saturday"
		time time
		text timezone
		interval duration
		text location
		integer min_players
	}

	SESSIONS {
		uuid id PK
		uuid club_id FK
		uuid schedule_pattern_id FK "nullable for exceptional sessions"
		date occurrence_date "pattern date it was generated for; null for exceptional sessions"
		timestamptz starts_at
		interval duration "inherits schedule pattern unless overridden"
		text location
		integer min_players "nullable override; required for exceptional sessions"
		text event_name
		text event_type
		text status
		text cancellation_reason
	}

	ATTENDANCES {
		uuid session_id PK, FK
		uuid member_id PK, FK
		text status
	}

	EXCEPTIONAL_PLAYERS {
		uuid id PK
		uuid session_id FK
		text name
	}

	CLUBS ||--o{ MEMBERS : includes
	CLUBS ||--o{ SCHEDULE_PATTERNS : defines
	SCHEDULE_PATTERNS o|--o{ SESSIONS : generates
	CLUBS ||--o{ SESSIONS : schedules
	SESSIONS ||--o{ ATTENDANCES : receives
	MEMBERS ||--o{ ATTENDANCES : responds
	SESSIONS ||--o{ EXCEPTIONAL_PLAYERS : includes
```

The application should enforce one club configuration per deployment, unique verified Google email per member when present, unique personal links, and one attendance response per member/session. Each person has one `MEMBERS` row and one `personal_link`; `is_player` and `is_admin` describe that member's roles. These links are bearer credentials; restrict database access and never expose them in public queries. Admin privileges must only be granted to members with `is_admin = true`.

## 17. Database Schema Management

- Each club has an isolated Supabase CLI project and a single fresh-install schema migration under `instances/<club>/supabase/migrations/`.
- Each Supabase project is connected to the repository through Supabase's GitHub integration. Its working directory is the repository-relative path containing that club's `supabase/` folder; for La Manchette, this is `instances/lamanchette`.
- With **Deploy to production** enabled for `main`, Supabase applies new migrations from the configured working directory when commits reach that branch.
- Each club's Supabase project uses its own working directory and database, so its migrations are deployed independently.
- The La Manchette schema seeds a Saturday 10:00 two-hour schedule in `Europe/Brussels` at Centre sportif de Blocry, an eight-player minimum, and Maximilian Barais (`mikebarais@gmail.com`) as an administrator-only member.
- Each recurring schedule stores its own IANA timezone; generated session timestamps use the timezone of their schedule pattern.
- Row-level security is enabled on all tables. The anonymous role can read club branding from `clubs`; the other tables have no anonymous access policies.
- Visiting `/p/<personal_link>` keeps the link in the address bar. The `session` Edge Function verifies the link and returns a one-hour token identifying the member once per page load. Tokens are not renewed automatically; reloading the page exchanges the link for a fresh token and reloads attendance data. Anyone holding the link authenticates as that member.
- With that token, row-level security lets a member read only their own `members` row, plus the club's schedule patterns, sessions, attendances, and exceptional players. A player can insert and update only their own attendance rows. Other players' names are available through the `club_players()` function, which never exposes personal links.
- Admin member operations use separate `admin_*` database functions that verify the caller's active administrator row and club. Only those functions return personal links or mutate member records.
- Deactivated members cannot exchange a personal link for a new session token; active-member checks block their existing token from club data access.
- After Google sign-in, the frontend exchanges the member's personal link for the same token, so both sign-in methods access data as the same member.
- Members cannot insert sessions directly. The `ensure_upcoming_sessions()` database function, callable only by members, creates missing pattern sessions idempotently.
- The consolidated migration is for a fresh database. Recreating La Manchette from it requires dropping the existing schema and resetting Supabase migration history; back up any data that needs to be kept first.

## 18. Explicitly Removed from the Final Design

- Players cannot add +1/+2 guests.
- There is no player-owned guest count.
- Exceptional participants are controlled exclusively by administrators.
- A custom purchased domain is not a functional requirement.
- A "generate WhatsApp links" feature is not part of the agreed baseline.
- General infrastructure, application deployment tooling, and database keep-alive mechanisms are outside the functional requirements. Database schema migrations remain a technical delivery requirement as described above.

## 19. Final Product Behaviour - Summary

PlayCount provides each club with a configurable recurring schedule plus the ability to create exceptional trainings and matches. Players access their club through either Google authentication or a personal direct link and manage only their own attendance. Administrators have broader control: they manage schedules, sessions, players, administrators, announcements, and exceptional participants, and can retrieve players' personal links. The main attendance view is a horizontally scrollable chronological matrix, with sessions as columns and players as rows, initially positioned on the next upcoming session.