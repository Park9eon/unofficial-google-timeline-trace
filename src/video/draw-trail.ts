export type ScreenTrailPoint = {
  x: number;
  y: number;
  frame: number;
  color: string;
  breakBefore: boolean;
  curveSign: number;
};

export type TrailSegment =
  | {kind: 'cubic'; from: ScreenTrailPoint; to: ScreenTrailPoint; c1x: number; c1y: number; c2x: number; c2y: number}
  | {kind: 'arc'; from: ScreenTrailPoint; to: ScreenTrailPoint; cx: number; cy: number};

export const trailSegment = (points: ScreenTrailPoint[], index: number): TrailSegment => {
  const from = points[index - 1];
  const to = points[index];
  if (to.breakBefore) {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const length = Math.max(1, Math.hypot(deltaX, deltaY));
    const curve = Math.min(180, length * 0.18) * to.curveSign;
    return {
      kind: 'arc',
      from,
      to,
      cx: (from.x + to.x) / 2 - deltaY / length * curve,
      cy: (from.y + to.y) / 2 + deltaX / length * curve,
    };
  }
  const before = points[Math.max(0, index - 2)];
  const after = points[Math.min(points.length - 1, index + 1)];
  const tension = 0.72 / 6;
  return {
    kind: 'cubic',
    from,
    to,
    c1x: from.x + (to.x - before.x) * tension,
    c1y: from.y + (to.y - before.y) * tension,
    c2x: to.x - (after.x - from.x) * tension,
    c2y: to.y - (after.y - from.y) * tension,
  };
};

export const drawTrail = (
  context: CanvasRenderingContext2D,
  points: ScreenTrailPoint[],
  opacityFor: (point: ScreenTrailPoint) => number,
  width: number,
) => {
  for (let index = 1; index < points.length; index += 1) {
    const segment = trailSegment(points, index);
    context.beginPath();
    context.moveTo(segment.from.x, segment.from.y);
    if (segment.kind === 'arc') context.quadraticCurveTo(segment.cx, segment.cy, segment.to.x, segment.to.y);
    else context.bezierCurveTo(segment.c1x, segment.c1y, segment.c2x, segment.c2y, segment.to.x, segment.to.y);
    context.strokeStyle = segment.to.color;
    context.globalAlpha = opacityFor(segment.to) * (segment.kind === 'arc' ? 0.42 : 1);
    context.lineWidth = width * (segment.kind === 'arc' ? 0.72 : 1);
    context.stroke();
  }
};
