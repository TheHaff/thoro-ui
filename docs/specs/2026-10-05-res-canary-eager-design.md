# res-canary eager checks — design

- **Status:** approved by the maintainer, 2026-10-06; implemented 2026-10-06. Firefox results come from CI.
- **Amends:** the canary spec [`2026-09-29-res-canary-design.md`](2026-09-29-res-canary-design.md) — §5 (types), §6 (detection: probes, violations) and §12 (decisions). Everything not named here is unchanged.
- **Ships as:** `0.2.0-beta.0`. Eager by default changes what `start()` does for `0.1.0-beta.0` users.

## Goal

Warn users up front. Today the canary sees a block only when the app's own request fails, or through a probe the app wrote by hand, so users often meet a broken feature before the banner. With eager checks, `start()` checks every vendor it can, so a block shows within moments, in every browser.

A second goal comes from the same code: script and style probes must catch blocks in Firefox. CI and two throwaway spikes (2026-10-05) showed that Firefox fires `load` on a preload link even when its request is refused, cancelled by tracking protection or answered with a 403 page.

## Decisions

| decision                                                                                                                              | why                                                                                                                                                                                                           | rejected                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eager by default; `lazy` opts out, at the top and per feature (the feature wins)                                                      | The component exists to warn before users hit bugs. `lazy: true` at the top reproduces `0.1` behaviour.                                                                                                       | Opt-in `probeOrigins` (maintainer: eager is the point); a helper function (no per-origin sharing).                                                   |
| The automatic check is `fetch(origin + '/', { method: 'HEAD', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer' })` | The only method where any HTTP answer counts as reachable (a vendor root that answers 404 or 405 isn't a block) and blocks and refusals reject, in every engine. No cookies or referrer reach the vendor.     | A preload of the root (Chromium treats a 404 as an error; Firefox misses blocks); an image (fails on HTML); resource timing (status 0 cross-origin). |
| An explicit `probe` replaces the automatic check                                                                                      | The app chose how to check that feature.                                                                                                                                                                      | Running both (double requests, and the automatic one needs `connect-src`).                                                                           |
| Only concrete `http(s)` origins are checked                                                                                           | `*.vendor.example` has no host to ask; a `ws(s)` origin can't be fetched and its `connect-src` entry wouldn't cover an `https` URL. Such origins are lazy.                                                    | Guessing a host for wildcards.                                                                                                                       |
| One request per origin, shared by every feature that lists it                                                                         | Fewer requests; one answer per origin.                                                                                                                                                                        | A request per feature.                                                                                                                               |
| A check the app's own CSP blocks is **inconclusive**                                                                                  | `fetch` needs `connect-src`, which many apps don't grant vendors. Reporting `own-csp` would hide a real block (own-csp outranks everything) and spam `onOwnPolicyViolation`.                                  | Treating it as `own-csp` (today's rule for explicit `fetch` probes, which stays).                                                                    |
| `style` probes use `<link rel="stylesheet" media="not all">`                                                                          | It errored for every failure in Firefox (tracking protection, 403, closed port) and never applies. No Chrome "unused preload" warning.                                                                        | Preload (fires `load` on failure in Firefox).                                                                                                        |
| `script` probes run a preload **and** a `fetch` of the same URL; either failing fails the probe                                       | No Firefox-safe way loads a script without running it. The `fetch` half catches blocks and refusals in Firefox when `connect-src` allows it; the preload keeps the script-type request ad blockers filter on. | Preload only (blind in Firefox).                                                                                                                     |
| Core budget 2 KB → 2.5 KB gzip                                                                                                        | Agreed with the maintainer for this change. Element (4 KB) and React (2 KB) budgets stay.                                                                                                                     | Trimming to 2 KB (no room left: the core was at 1.98 KB).                                                                                            |

## 1. API

```ts
type Feature = {
  // … unchanged fields …
  /** Skip the automatic start-up check for this feature. Overrides CanaryOptions.lazy. */
  lazy?: boolean
}

type CanaryOptions = {
  // … unchanged fields …
  /** Default false: start() checks every feature it can. true = only probes you configure, as in 0.1. */
  lazy?: boolean
}
```

At `start()`, each feature is checked once:

1. **It has a `probe`:** that probe runs, whether or not the feature is lazy.
2. **Otherwise, unless `feature.lazy ?? options.lazy` is true:** each of its concrete `http(s)` origins is checked (§2).
3. A feature with no such origin and no probe gets no start-up check.

A feature's checks combine: any failure → `load-failed`; else any success → `ok`; all inconclusive → status unchanged. Statuses still only move up (§6.6 of the canary spec), and `stop()` aborts pending checks as before.

## 2. Checks

| check                             | request                                                            | reachable                                                           | failed                                 | inconclusive                                                                                |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| automatic, per origin             | `HEAD <origin>/`, no-cors, no credentials, no referrer             | the promise resolves                                                | it rejects, or `probeTimeoutMs` passes | it rejects and the app's own policy reported a `connect-src` violation for that origin (§3) |
| `script` probe                    | preload `as="script"` + `HEAD <url>` with the same fetch options   | both succeed, or the preload succeeds and the fetch is inconclusive | either fails, or the timeout passes    | —                                                                                           |
| `style` probe                     | `<link rel="stylesheet" media="not all">`, removed once it settles | `load`                                                              | `error`, or the timeout passes         | —                                                                                           |
| `image`, `fetch`, `custom` probes | unchanged                                                          |                                                                     |                                        |                                                                                             |

An explicit `fetch` probe keeps today's rule: blocked by the app's own policy → `own-csp` and `onOwnPolicyViolation`, because the app configured it.

## 3. Inconclusive

The core keeps the set of origins it is checking with its own `fetch` (automatic checks and the `fetch` half of script probes). A `securitypolicyviolation` that is **enforced**, matches the app's **own** policy, has `effectiveDirective` `connect-src`, and whose `blockedURI` has one of those origins:

- marks that origin's check inconclusive;
- sets no status and calls no `onOwnPolicyViolation` (it is the canary's own request, not the app's).

The browser still sends the violation to the app's CSP reporting endpoint, if it has one — one report per checked origin per page load. The README says so and tells apps to add their vendor origins to `connect-src`, or to mark those features `lazy`.

A rejected check waits one task (`setTimeout(…, 0)`) before deciding, so the violation event can arrive first. **To verify in the first implementation task:** the event order in Chromium, Firefox and WebKit, with a page whose CSP lacks `connect-src` for the vendor. If an engine delivers the violation later, the wait becomes the smallest delay that passes in all three.

## 4. Tests

**Unit (happy-dom):** the eager rule (top-level, per feature, the feature winning, an explicit probe replacing the check, wildcard and `ws(s)` origins skipped); one request per origin; the exact fetch options; combining (failure beats success; all inconclusive leaves the status); the inconclusive rule (status unchanged, no callback, an unrelated own violation still reported); `stop()` aborts; the script probe (either half failing fails it; an inconclusive fetch leaves it to the preload); the style probe (the stylesheet link, `media="not all"`, removed after settling). Existing tests that call `start()` pass `lazy: true` to keep testing 0.1 behaviour.

**Browser (Chromium, Firefox, WebKit):**

1. Eager: a reachable origin → `ok`; a refused origin (the closed test port) → `load-failed`, Firefox included.
2. A page whose CSP lacks `connect-src` for the vendor: the check is inconclusive — status `unknown`, no own-policy callback.
3. Script and style probes, refused → `load-failed` in every engine (the two `test.fail` markers go). A 403 page → `load-failed` for style probes everywhere and for script probes in Chromium and WebKit; Firefox's script probe misses it (the `fetch` half sees any HTTP answer as reachable) and stays an expected failure.
4. Firefox with tracking protection on (a Firefox-only project with the prefs the spike used): an eager check of a tracker test host → `load-failed`.

Existing fixtures that start a canary pass `lazy: true`.

## 5. Docs and release

- **Package README:** eager by default and `lazy` (quick start, options, feature fields); the `connect-src` advice and the CSP-report note; no cookies or referrer are sent; Limitations — replace the Firefox line with what remains: every fetch-based check (automatic, `fetch` probe, the fetch half of a script probe) counts a proxy's error page as reachable, and in Firefox a `script` probe can only rely on that half.
- **Docs site:** `lazy` rows in the reference tables; "How it works" mentions the start-up check. The live demo never calls `start()`, so it needs no change.
- **Canary spec:** status line points here; §6 notes that probes run per this spec.
- **AGENTS.md:** the core budget (2.5 KB), and this spec and its plan in Status.
- **Version:** `0.2.0-beta.0`. Publishing stays the maintainer's step.

## Out of scope

Detecting a proxy's error page through `fetch` (impossible with no-cors); probing `ws(s)` and wildcard origins; re-checking after `start()` (an on-demand `check()` was considered and not chosen).
