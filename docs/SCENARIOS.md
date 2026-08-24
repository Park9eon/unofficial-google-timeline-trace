# Synthetic scenario catalog

The Studio and automated tests use the same deterministic catalog. No scenario is copied from a personal Timeline, and no real person's coordinates, dates, or habits are included.

## Everyday stories

| Scenario | What it exercises |
| --- | --- |
| Quiet neighborhood life | short trips, long stays, and low map movement |
| Mixed metro commute | repeated walking, subway, and bus changes |
| Intercity commute | recurring high-speed travel and short stays |
| Weekly flight commute | airport transfers, flights, and observation gaps |
| Mixed micromobility | rapid walking, running, cycling, and tram changes |

## Journeys

| Scenario | What it exercises |
| --- | --- |
| National loop | several cities and a return to the origin |
| Coastal road trip | long curved vehicle movement |
| Island hopping | repeated short flights and stays |
| Multi-city honeymoon | long destination stays and a round trip |
| Open-jaw world journey | different outbound and return routes |
| Round the world | multiple continents and the date line |
| Cross-border rail | many intermediate stops on a long rail route |
| Mountain ski season | frequent direction changes in a compact region |

## Edge cases

| Scenario | What it exercises |
| --- | --- |
| Dense urban GPS canyon | 720 dense points and one isolated spike |
| Tunnel and signal gaps | missing observations inside a continuous journey |
| Long stationary jitter | 240 small coordinate changes around one place |
| Date-line round trip | shortest-path interpolation across 180 degrees |
| High-latitude journey | coordinates near the Web Mercator limit |
| Overlap and outlier | repeated times and a sudden return spike |
| Multi-year archive and hiatus | activity separated by a multi-year gap |

## Motion matrix

`scenario-matrix.test.ts` runs every scenario through:

- two timing modes
- three camera modes
- three aspect ratios
- 30 and 60 FPS

This produces 720 combinations. Each combination verifies exact endpoints, ordered phases, finite position values, zoom bounds, per-frame zoom speed, a bounded number of zoom-direction reversals, and marker containment inside the safe viewport. The catalog is also selectable in the Studio for visual review without importing a file.
