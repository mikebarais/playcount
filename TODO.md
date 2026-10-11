# TODO

## Personal-Link Name Display

- Verify session token renewal once screens make database requests more than an hour after page load.

## Administration

- Add a "Session patterns" admin tab (after Members) to manage schedule patterns (day, time, duration, location, minimum players).
- Add an "Announcements" admin tab (last) for a club notification banner (e.g. "pay your annual membership fee"): a `clubs` column editable by admins and shown to members.
- Allow deleting an exceptional session created by mistake (currently it can only be cancelled).
- Allow editing a session's duration, and an exceptional session's date, name and type.

## Internationalization

- Move UI strings in `src/*.jsx` into English message files and add other languages (e.g. French).
- Translate status codes (`present`, `uncertain`, `absent`, `scheduled`, `cancelled`) for display; keep the database codes unchanged.
- Format dates and times with the selected locale instead of the fixed `'en'` locale in `AttendanceMatrix.jsx`.