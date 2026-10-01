# Issue #54: single-agent vs parallel implementation

Measured on 2026-10-01. Both experiments started from commit `16b8de1` with the same feature requirements and inherited model settings. One agent implemented the entire guide; two parallel agents divided guide content and UI integration. Each experiment ran its complete test suite and build. Parent coordination and final integration usage are excluded.

| Metric | Single agent | Parallel agents combined |
| --- | ---: | ---: |
| Logged agent interval | 471.3 s | 404.6 s |
| Input tokens | 1,211,385 | 2,136,747 |
| Cached input tokens (included above) | 1,154,176 | 2,083,328 |
| Output tokens (including reasoning) | 9,926 | 11,256 |
| Total tokens | 1,221,311 | 2,148,003 |
| Uncached input + output | 67,135 | 64,675 |
| Passing tests | 136 | 140 |

For parallel time, measure from the first child start to the last child's last recorded usage; do not sum their elapsed times. Tokens come from each child's last cumulative `token_count` event in the local session logs. Reasoning is already included in output and must not be counted twice.

This trial logged 14.2% less elapsed time and 75.9% more total tokens for the parallel approach. Uncached input plus output was 3.7% lower. These are token counts, not a monetary bill or an estimate of plan-limit consumption.

## Limitations and choice

This is one exploratory trial, not a controlled performance claim. Both experiments ran concurrently on the same computer. Their implementations and tests differ. The single agent performed about 30 seconds of browser verification before the parent took over equal visual checks; QA corrections are included in the usage totals. Dispatch, final messages, and inter-agent coordination also affect logged intervals. After removing that extra 30 seconds, the apparent time benefit drops to roughly 8%.

Both implementations passed desktop and 390 px wide viewport checks. The single-agent version was selected because its header keeps the return button accessible while reading a long guide. The alternative remains in local branch `codex/guide-parallel` for inspection and was not published.

For this scope, parallelism modestly improved turnaround, while duplicated cached context substantially raised gross token counts. Larger independent tasks may benefit more; small dependent UI edits should generally stay with one agent.
