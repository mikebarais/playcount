# TODO

## Personal-Link Name Display

- Verify session token renewal once screens make database requests more than an hour after page load.

## Internationalization

- Move UI strings in `src/*.jsx` into English message files and add other languages (e.g. French).
- Translate status codes (`present`, `uncertain`, `absent`, `scheduled`, `cancelled`) for display; keep the database codes unchanged.
- Format dates and times with the selected locale instead of the fixed `'en'` locale in `AttendanceMatrix.jsx`.