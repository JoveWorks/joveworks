# Alpha analytics

JoveWorks may use Plausible Analytics during alpha to learn whether the editor's
core workflow is usable. It is aggregate, cookieless measurement; it is not a
user account, profiling, or diagnostic system.

Analytics is enabled only in a build whose environment contains all of:

```text
VITE_ANALYTICS=plausible
VITE_PLAUSIBLE_SCRIPT_URL=<site-specific pa-…js URL from Plausible>
```

Without that exact enablement value, the editor uses a no-op adapter: it does
not add a tracker script or send analytics requests. These are build-time Vite
variables, so changing them requires a new deployment. They are configuration,
not secrets: browser code can read them.

## Plausible and Netlify setup

1. Create a site in the self-hosted Plausible instance for the exact alpha
   domain deployed by Netlify.
2. Copy the `src` URL from that site's exact installation snippet (the
   site-specific `pa-…js` URL) into `VITE_PLAUSIBLE_SCRIPT_URL`.
3. Set the two variables above only in Netlify's alpha deploy context, then
   deploy. Do not set `VITE_ANALYTICS` for production or preview contexts that
   should remain untracked.
4. In the Plausible site settings, **uncheck** outbound links, file downloads,
   and form submissions. They are outside this inventory.
5. Add each custom event named below as a Plausible custom-event goal when its
   conversion count should appear in the dashboard. The event name must match
   exactly.

## What it logs

Plausible's default pageview, plus these custom events:

| Event | When it is sent | Properties |
| --- | --- | --- |
| `catalogue_loaded` | A catalogue file was parsed and accepted | None |
| `catalogue_load_failed` | A chosen catalogue file was rejected | `reason=invalid_file` |
| `catalogue_unlocked` | A locked catalogue was decrypted and added | None |
| `catalogue_unlock_failed` | A locked catalogue's password did not decrypt it | `reason=wrong_password` |
| `example_opened` | A built-in example was opened | None |
| `graph_created` | The user created a new graph | None |
| `document_load_failed` | A chosen graph file was rejected | `reason=invalid_file` |
| `node_added` | A node was added through an editor transaction | `kind` from a fixed node-kind list |
| `nodes_connected` | A connection was added | None |
| `sweep_configured` | An input changes to a sweep kind | `kind` from the fixed list `slider`, `linear`, `logarithmic`, `list`, `renard`, `tableColumn`, or `categoricalList` |
| `plot_created` | A plot output is added or changed to a plot | `mode=line` or `contour` |
| `table_created` | A table output is added or changed to a table | None |
| `check_created` | A check output is added or changed to a check | None |
| `document_saved` | The graph download was requested | None |
| `notebook_exported` | The notebook print/PDF export was requested | None |
| `mobile_landing_viewed` | The narrow-viewport, desktop-only landing is shown | None |
| `course_viewer_opened` | The read-only course-material viewer opens | `viewport=narrow` or `wide` |
| `course_material_selected` | A bundled course example is shown in the viewer | `material=platform`, `pad`, `cantilever`, or `milling` |

## What it never logs

The tracker never receives catalogue or formula IDs, graph/node IDs, node or
document titles, notes, formula expressions, input/output values, units,
filenames, raw URLs with user data, exception messages, stack traces, or any
free-form text. It does not use custom properties outside the finite list above;
the course-material value identifies only one of four bundled public examples.

The events are intentionally directional: content blockers, disabled JavaScript,
and network failures can prevent them from being counted.

## Removal

Before public launch, deploy without `VITE_ANALYTICS=plausible` to stop all
tracking immediately. Removing the small `src/analytics/` adapter and these
build variables then removes the feature from the codebase without a search
through editor behaviour.
