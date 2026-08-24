# Motion model

All output is deterministic for the same normalized Timeline, configuration, locale, and frame.

## Playback timing

Both timing modes score each edge from distance `d`, elapsed minutes `m`, and distance influence `e`:

`score = e × 0.65 × d^0.58 + (1 - e) × 0.35 × log(1 + m)`

Observation gaps use a distance exponent of 0.62 and a smaller time term. Visits use a stronger `log(1 + m)` term.

Cinematic duration combines active-day and distance logarithms, multiplies the result by information density, and clamps the result to 15–600 seconds. It expands when journey phase minima require more time.

Fixed duration uses the exact requested duration. If phase minima exceed the available frames, all minima are reduced proportionally before the remaining frames are distributed by edge score.

Long-distance edges form outbound, destination, return, transition, and routine phases. The current thresholds and time budgets are centralized in `motion-constants.ts`.

## Position interpolation

Normal edges use monotonicity-limited cubic Hermite interpolation. Tangents that oppose the segment direction are removed and normalized tangent magnitude is capped at three.

Long observation gaps use great-circle interpolation with quintic smootherstep progress. Longitudes are unwrapped before interpolation and wrapped again for output.

## Predictive camera

The camera derives data-relative references from the 75th percentile of non-gap edge distance and visual playback speed. Significant pins are visits, journey boundaries, observation gaps, and edges at least three times the distance reference.

For every camera target:

1. The current visual speed and distance to the next significant pin are normalized with `tanh`.
2. Those signals scale the configured anticipation maximum into a frame-specific prediction window.
3. Future points decay exponentially with their distance in frames.
4. The current position, predicted corridor, next pin confidence, and journey arrival recovery determine the Mercator center and envelope.
5. Output dimensions and frame occupancy convert the envelope into a target zoom.

Target views are converted to `[centerX, centerY, visibleWorldWidth]`. Time-aware cubic Hermite tangents keep center velocity continuous through ordinary knots. D3 `interpolateZoom` contributes only a bounded share of the path when displacement spans several viewports, preventing every short segment from creating its own zoom-out/zoom-in pulse.

When a significant pin is passed, the old pin influence fades out while the new pin influence fades in over 2.5 seconds. Center movement is limited from output size, FPS, travel phase, and the configured smoothing value before the marker-safe-area constraint is applied. Zoom still uses a deadband, direction hold, and per-second rate limits.

The Follow camera uses the same speed and pin signals with a narrower lead and a small dynamic zoom-out. Overview uses fixed date-line-safe bounds.

## Marker heading

Emoji selection is automatic from the current activity. Heading uses an activity-specific forward window, a backward filter window, and a minimum movement distance. Walking responds quickly, vehicles look farther ahead, flights ignore short coordinate noise, and stationary activities require substantial movement before direction changes. Plane symbols rotate to the computed bearing; other emoji remain upright and mirror east or west while a surrounding direction needle shows the full bearing.

## Trail

Playback points are projected into Web Mercator, date-line longitudes are unwrapped, and Douglas–Peucker simplification keeps at most 5,000 points. Gap endpoints remain mandatory. Normal edges use cubic Bézier segments; long gaps use lower-opacity quadratic arcs.
