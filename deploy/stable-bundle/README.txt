JoveWorks — stable bundle deployment
=====================================

This zip is a complete, self-contained build of JoveWorks. It is a static
site: there is no server-side code, no database, and nothing to install.
Any web server that can serve files can serve this.

1. Unzip
--------
Unzip the archive. You'll get an index.html file plus assets/, docs/, and
author/ folders (and one of the server-config files below, if you keep it).

2. Point your web server's document root at the unzipped folder
-----------------------------------------------------------------
Configure your web server so the unzipped folder IS the document root —
index.html should be reachable directly at the site's root URL
(https://your-domain/index.html), not nested one level down.

3. Add the single-page-app fallback rule
------------------------------------------
JoveWorks is a single-page app: the browser loads one index.html and
handles navigation itself. Your web server needs to serve index.html for
any URL path that isn't a real file, instead of returning a 404. This
bundle includes the two most common ways to do that:

  - nginx.conf.snippet — paste into your site's nginx server block.
  - .htaccess           — drop alongside index.html if you're on Apache
                           with mod_rewrite (most shared hosting).

If your host is neither of those, look for a "SPA fallback", "rewrite all
routes to index.html", or "custom 404 = index.html" setting — that's the
same rule under a different name.

4. Subpath hosting (e.g. https://your-domain/joveworks/ instead of the
   domain root)
------------------------------------------------------------------------
This bundle is built to be served from the domain root. If you need to
host it under a subpath, the app needs to be *built* with that path baked
in (it is not something you can change by editing these files after the
fact) — let us know the subpath before you deploy and we'll produce a
bundle built for it. Deploying this root-path bundle under a subpath will
show a blank page, because it will look for its own assets (CSS, JS) at
the wrong URLs.

5. Verify it worked
--------------------
  - Open the site's root URL in a browser. The JoveWorks editor should
    load (palette on the left, canvas in the middle, NodeBook on the
    right).
  - Check the small version badge in the top menu bar reads
    "stable vX.Y.Z" — if it says "nightly" instead, you've deployed the
    wrong build.
  - Reload the page after navigating within the app (or open a
    bookmarked/shared link directly). If you get your web server's 404
    page instead of JoveWorks, the SPA fallback rule from step 3 isn't
    active yet.

Questions
---------
thomas.van.riel@gmail.com
