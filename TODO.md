# TODO

## Personal-Link Name Display

- Verify session token renewal once screens make database requests more than an hour after page load.

## Administration

- Sessions tab: add a button to create an exceptional session (date, time, duration, location, name/type, minimum players).
- Sessions tab: list regular and exceptional sessions together, ordered chronologically.
- Add an admin tab to manage schedule patterns (day, time, timezone, duration, location, minimum players).
- Add a club notification/alert banner (e.g. "pay your annual membership fee"): a `clubs` column editable by admins and shown to members.

## Internationalization

- Move UI strings in `src/*.jsx` into English message files and add other languages (e.g. French).
- Translate status codes (`present`, `uncertain`, `absent`, `scheduled`, `cancelled`) for display; keep the database codes unchanged.
- Format dates and times with the selected locale instead of the fixed `'en'` locale in `AttendanceMatrix.jsx`.