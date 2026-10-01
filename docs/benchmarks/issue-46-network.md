# Issue #46: friend-game network traffic

Measured with the deterministic model on 2026-10-01. Run from the repository root:

```sh
node tests/network-benchmark.mjs
node --test tests/network-*.test.js
```

The model represents one visible friend-game client for one hour: eighty alternating moves, one every 44 seconds, followed by eighty seconds of result/rematch polling. Forty moves are this client's POST requests; the other forty are received by GET. Initial create/join requests are excluded equally. Each mutation's response supplies the latest version and replaces the next read timer. The baseline reads every two seconds independently of moves; the improved schedule reads every eight seconds on this client's turn and every two seconds while awaiting the opponent or a rematch. Unchanged responses carry no JSON body.

| Metric | Baseline | Improved |
| --- | ---: | ---: |
| GET requests | 1,800 | 1,120 |
| Move POST requests | 40 | 40 |
| All requests | 1,840 | 1,160 |
| Unchanged responses with no body | 0 | 1,080 |
| Full JSON GET responses | 1,800 | 40 |
| UTF-8 response body bytes | 6,401,622 | 278,485 |

This model produces 37.0% fewer requests and 95.6% fewer response body bytes. Every opponent update is received. JSON payloads use the initial engine board with modeled version/ply/turn/result and growing Japanese move logs; the sequence is a traffic fixture rather than eighty validated engine moves. It excludes HTTP headers, TLS overhead, compression, database charges, animations, failed requests, offer actions and network latency. These are reproducible modeled savings, not measurements of production bills or a browser's total transferred bytes.

## Behavior and limits

- An authenticated `GET /api/rooms/:id?version=N` returns `304` only after authorization, room expiry and game clock checks. `X-Room-Server-Now` keeps the displayed clock aligned and `X-Room-Version` carries the known version. Older clients without a version receive the complete view. An invalid version also receives a complete view.
- All room mutations already increment the version. Joining, moves, draw/undo offers and acceptance, resigning, rematches and leaving therefore deliver a complete update. A result continues polling so rematch/closure changes arrive; a known closed room stops polling.
- Hidden friend tabs check every ten seconds. Returning to a visible tab should call `refresh()` immediately. The standard visible detection bounds are two seconds while awaiting the opponent, and eight seconds for an opponent's offer during this client's turn, plus the duration of the request. Clock-sensitive callers can shorten the delay through `getDelay`.
- Failed reads retry with exponential delay starting near five seconds, doubling to a thirty-second cap with jitter. The poller schedules after a read settles, shares concurrent refreshes, aborts on stop, and suppresses stale results. `start({immediate:false})` avoids a redundant GET immediately after a create/join/action response.
- Transport diagnostics retain only request/read/write/unchanged/error/abort counts and an estimate of UTF-8 response body bytes. They retain no room IDs, invitations, tokens, moves or URLs. Local AI computations do not count as requests. `resetStats()` also isolates late results from a prior session.
- Build-generated SHA-256 ETags allow `If-None-Match` revalidation for text and binary assets. `Cache-Control: no-cache` requires revalidation before reuse; a new content hash supplies updated files. GET/HEAD 304 responses, MP4 ranges, range HEAD requests and 416 responses are verified against the compiled Worker. Asset responses retain security headers.

## Validation

Network tests cover authorization before 304, matching/invalid/stale versions, server timestamps, body omission, timeout and expiry, moves and offer/undo/rematch/closure updates, aggregate counters, cancellation/coalescing, deferred first reads, clock deadline overrides, the one-hour model and compiled static asset revalidation/ranges. Existing online and room-close tests verify backward compatibility and the room cleanup lifecycle.
