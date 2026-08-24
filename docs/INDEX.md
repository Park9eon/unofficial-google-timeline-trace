# Documentation index

- [Architecture](./ARCHITECTURE.md): browser boundaries, persistence, rendering, and caching
- [State model](./STATE_MODEL.md): independent loading, failure, cancellation, and recovery paths
- [Features](./FEATURES.md): current editor and output options
- [Timeline data](./DATA.md): supported export shape, local storage, and deletion
- [Motion model](./MOTION_MODEL.md): timing, interpolation, predictive cameras, and trails
- [Synthetic scenarios](./SCENARIOS.md): public test stories and invariant matrix
- [Accessibility](./ACCESSIBILITY.md): keyboard scope, labels, focus, contrast, and automated checks
- [Performance](./PERFORMANCE.md): precomputation, online map caching, and Chrome budgets
- [Research](./RESEARCH.md): primary references and library choices
- [Deployment](./DEPLOYMENT.md): static build and map asset hosting
- [Testing](./TESTING.md): automated and browser verification

Runtime schemas are defined in `src/domain/timeline.ts`. Motion constants are defined in `src/domain/motion-constants.ts`. Documentation and the corresponding tests must change with either contract.
