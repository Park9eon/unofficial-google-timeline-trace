# Studio state model

The Studio shell and recovery controls are available from the first paint. A synthetic sample is usable while browser data, the map, or another operation is still loading.

## Independent operations

| Region | States | Recovery behavior |
| --- | --- | --- |
| Browser data | loading, ready, error | a failed restore keeps the sample available and can be retried |
| Timeline import | idle, importing, error | failure or cancellation preserves the previous Timeline or sample |
| Map display | idle, loading, ready, error | playback pauses until ready; retry creates a fresh map instance |
| Video render | idle, rendering, complete, error | cancellation returns to idle; another render can start after failure |

The XState machine models these as parallel regions. One error cannot turn the entire page into a blocking loading or error screen.

## Time limits and cleanup

- Browser-data restoration has a five-second limit.
- Timeline parsing has a 120-second limit and terminates its Worker on completion, failure, timeout, or cancellation.
- Local deletion operations have time limits and settle independent stores so one unavailable store does not leave the dialog busy forever.
- Video rendering owns a separate `AbortController`.

## Committed versus transient data

An imported Timeline replaces the active source only after parsing succeeds. If the browser cannot persist it, the Timeline remains available for the current session with an explanatory status. Configuration changes are validated before they are stored. Viewed online map responses are transient browser cache data.
