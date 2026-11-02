# Allow embedding on the Planting Weeds site

## Prompt

> While I'm doing that please work on embedding this as a page on the
> Planting Weeds website https://github.com/smith2415/PlantingWeeds

The Planting Weeds page itself is a separate PR in that repository. This PR
is what InfoTracer needs so it can be shown there in a frame.

## What changed (`src/embed.js`, `src/app.js`)

- **Who may frame the app:** a `Content-Security-Policy: frame-ancestors`
  header allows only the app itself and `https://smith2415.github.io`
  (changeable with the `FRAME_ANCESTORS` secret). Any other site that tries
  to frame it gets a blank frame, which stops click-tricking pages.
- **Login inside the frame:** browsers only send a cookie into a frame on
  another site if it's `SameSite=None; Secure`. Over HTTPS the login cookie
  is now that, plus `Partitioned`, so browsers that keep a separate cookie
  jar per site still keep the login for the frame. Over plain HTTP (local
  runs) it stays `SameSite=Lax`, because browsers refuse the other kind there.
- **Forged forms:** `SameSite=Lax` had been quietly stopping other websites
  from submitting forms to the app with a signed-in visitor's cookie. With
  `SameSite=None` that protection is gone, so `sameSiteFormsOnly` now refuses
  any form post whose `Origin` (or `Referer`) names another site.

## Found along the way

express-session stores its cookie settings on the store object, so the HTTPS
and HTTP session setups each need their own store (same table). The first
attempt shared one and the HTTPS cookie came out as Lax; the test caught it.

## Tests

`tests/embed.test.js`: the frame header; the HTTPS and HTTP cookies; forms
from another site (by Origin, by Referer, and from a sandboxed frame) are
refused and save nothing; forms from the app's own pages, including through
a proxy, are accepted. Also checked in Chromium: a page on a different site
framing the app, with signing up and adding a claim inside the frame.
