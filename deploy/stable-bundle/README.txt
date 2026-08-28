JoveWorks — stable bundle deployment
=====================================

This zip is a complete, self-contained build of JoveWorks. It is a static
site: there is no server-side code, no database, and nothing to install.
Any web server that can serve files can serve this.

1. Unzip
--------
Unzip the archive. You'll get an index.html file plus assets/, docs/, and
author/ folders (and one of the server-config files below, if you keep it).

2. Point your web server at the unzipped folder
--------------------------------------------------
This bundle works unmodified at the domain root (https://your-domain/) OR
under a subpath (https://your-domain/joveworks/) — nothing to configure
either way, and no rebuild needed if you decide to move it later. Just make
sure index.html is reachable directly wherever you put it (e.g.
https://your-domain/joveworks/index.html), not nested one level further.

The one exception is the built-in documentation: the "?" help buttons in
the app, and the docs/ folder if browsed directly, are built assuming
domain-root hosting. Under a subpath they'll point at
https://your-domain/docs/... instead of https://your-domain/joveworks/docs/...
and 404. Nothing else in the app is affected — the editor itself and the
author/ tool work regardless. If you need the docs to work correctly under
a subpath too, let us know the subpath and we'll produce a docs build for
it.

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

4. Verify it worked
--------------------
  - Open the app's URL (domain root or your subpath) in a browser. The
    JoveWorks editor should load (palette on the left, canvas in the
    middle, NodeBook on the right).
  - Check the small version badge in the top menu bar reads
    "stable vX.Y.Z" — if it says "nightly" instead, you've deployed the
    wrong build.
  - Reload the page after navigating within the app (or open a
    bookmarked/shared link directly). If you get your web server's 404
    page instead of JoveWorks, the SPA fallback rule from step 3 isn't
    active yet.
  - If you're hosting under a subpath, click a node's "?" help button and
    confirm it lands on a real docs page rather than a 404 — see the note
    in step 2 if it doesn't.

5. If the course is served through a JoveWorks Hub
----------------------------------------------------
Some schools link to this bundle through a JoveWorks Hub, which turns
short course links into full editor links automatically. If that's your
setup, whoever administers the Hub needs to point its editor address
setting at wherever you just put this bundle. If they don't, students
clicking a course link will land on a different copy of the app than the
one you deployed here — and because browsers keep saved work separate
per address, anything a student had saved there won't show up after they
land on this one. Let your Hub administrator know the address you used
as soon as this bundle is live.

Questions
---------
thomas.van.riel@gmail.com
