import {haversineDistance} from '@/domain/geo';
import type {ActivityType, NormalizedTimeline, TrackPoint} from '@/domain/timeline';

export type ScenarioDefinition = {
  id: string;
  title: {ko: string; en: string};
  description: {ko: string; en: string};
  category: 'everyday' | 'journey' | 'edge-case';
  timeline: NormalizedTimeline;
};

type Waypoint = {
  latitude: number;
  longitude: number;
  activity: ActivityType;
  hours?: number;
  gap?: boolean;
};

const startTime = Date.UTC(2025, 0, 1, 9);

const timelineFromPoints = (id: string, draft: Array<Omit<TrackPoint, 'id' | 'cumulativeDistanceMeters'>>) => {
  let cumulativeDistanceMeters = 0;
  const points = draft.map((value, index): TrackPoint => {
    if (index > 0 && !value.breakBefore) cumulativeDistanceMeters += haversineDistance(draft[index - 1], value);
    return {...value, id: `${id}-${index}`, cumulativeDistanceMeters};
  });
  return {
    summary: {
      sourceName: `${id}.sample`,
      sourceHash: `sample-${id}`,
      startTime: new Date(points[0].timestamp).toISOString(),
      endTime: new Date(points.at(-1)!.timestamp).toISOString(),
      totalSegments: points.length,
      totalPathPoints: points.length,
      activityCount: points.filter((point) => point.kind === 'activity').length,
      visitCount: points.filter((point) => point.kind === 'visit').length,
      pathCount: points.filter((point) => point.kind === 'path').length,
      ignoredCount: 0,
      invalidPointCount: 0,
      distanceMeters: cumulativeDistanceMeters,
    },
    points,
  } satisfies NormalizedTimeline;
};

const route = (id: string, waypoints: Waypoint[], samplesPerLeg = 10) => {
  const points: Array<Omit<TrackPoint, 'id' | 'cumulativeDistanceMeters'>> = [];
  let timestamp = startTime;
  waypoints.forEach((waypoint, waypointIndex) => {
    if (waypointIndex === 0) {
      points.push({...waypoint, timestamp, timezoneOffsetMinutes: 540, kind: waypoint.activity === 'visit' ? 'visit' : 'path', breakBefore: false});
      return;
    }
    const before = waypoints[waypointIndex - 1];
    const hours = waypoint.hours ?? 2;
    for (let sample = 1; sample <= samplesPerLeg; sample += 1) {
      const progress = sample / samplesPerLeg;
      timestamp += hours * 3_600_000 / samplesPerLeg;
      points.push({
        timestamp,
        timezoneOffsetMinutes: 540,
        latitude: before.latitude + (waypoint.latitude - before.latitude) * progress,
        longitude: before.longitude + (waypoint.longitude - before.longitude) * progress,
        activity: waypoint.activity,
        kind: sample === samplesPerLeg && waypoint.activity === 'visit' ? 'visit' : 'path',
        breakBefore: Boolean(waypoint.gap && sample === 1),
      });
    }
  });
  return timelineFromPoints(id, points);
};

const define = (id: string, ko: string, en: string, koDescription: string, enDescription: string, category: ScenarioDefinition['category'], waypoints: Waypoint[], samples = 10): ScenarioDefinition => ({
  id, title: {ko, en}, description: {ko: koDescription, en: enDescription}, category, timeline: route(id, waypoints, samples),
});

const seoul = {latitude: 37.5665, longitude: 126.978};
const busan = {latitude: 35.1796, longitude: 129.0756};

const stationaryJitter = () => timelineFromPoints('stationary-jitter', Array.from({length: 240}, (_, index) => ({
  timestamp: startTime + index * 60_000,
  timezoneOffsetMinutes: 540,
  latitude: 37.5665 + Math.sin(index * 1.7) * 0.000025,
  longitude: 126.978 + Math.cos(index * 1.3) * 0.000025,
  activity: 'visit',
  kind: 'visit' as const,
  breakBefore: false,
})));

const denseUrban = () => timelineFromPoints('urban-gps-canyon', Array.from({length: 720}, (_, index) => ({
  timestamp: startTime + index * 15_000,
  timezoneOffsetMinutes: 540,
  latitude: 37.55 + Math.sin(index / 24) * 0.055 + (index === 311 ? 0.08 : 0),
  longitude: 126.99 + Math.cos(index / 22) * 0.07 + (index === 311 ? -0.08 : 0),
  activity: index % 5 === 0 ? 'in passenger vehicle' : 'walking',
  kind: 'path' as const,
  breakBefore: false,
})));

export const sampleScenarios: ScenarioDefinition[] = [
  define('neighborhood-life', '조용한 동네 생활', 'Quiet neighborhood life', '짧은 이동과 긴 머무름', 'Short trips and long stays', 'everyday', [{...seoul, activity: 'visit'}, {latitude: 37.57, longitude: 126.99, activity: 'walking'}, {...seoul, activity: 'visit'}], 18),
  define('metro-week', '복합 대중교통 출퇴근', 'Mixed metro commute', '도보·지하철·버스가 반복되는 일상', 'A repeating walk, subway, and bus commute', 'everyday', [{...seoul, activity: 'visit'}, {latitude: 37.51, longitude: 127.1, activity: 'walking'}, {latitude: 37.4, longitude: 127.12, activity: 'in subway'}, {latitude: 37.39, longitude: 127.15, activity: 'in bus'}, {...seoul, activity: 'visit'}], 24),
  define('intercity-commute', '도시 간 장거리 출퇴근', 'Intercity commute', '고속 이동과 짧은 체류가 반복됨', 'Repeated high-speed travel and short stays', 'everyday', [{...seoul, activity: 'visit'}, {latitude: 36.35, longitude: 127.38, activity: 'in train', hours: 2}, {...seoul, activity: 'visit', hours: 2}], 16),
  define('flight-commute', '주간 비행 출퇴근', 'Weekly flight commute', '공항 이동과 비행이 일상에 섞임', 'Airport transfers and flights mixed into a routine', 'everyday', [{...seoul, activity: 'visit'}, {latitude: 37.46, longitude: 126.44, activity: 'in passenger vehicle'}, {latitude: 33.51, longitude: 126.49, activity: 'flying', hours: 2, gap: true}, {...seoul, activity: 'flying', hours: 2, gap: true}], 10),
  define('national-loop', '전국 순환 여행', 'National loop', '여러 도시를 거쳐 출발지로 돌아오는 여정', 'A multi-city loop returning to its origin', 'journey', [{...seoul, activity: 'visit'}, {latitude: 37.75, longitude: 128.88, activity: 'in bus'}, {...busan, activity: 'in train'}, {latitude: 35.16, longitude: 126.85, activity: 'in passenger vehicle'}, {latitude: 36.35, longitude: 127.38, activity: 'in train'}, {...seoul, activity: 'visit'}], 14),
  define('coastal-road-trip', '해안 도로 여행', 'Coastal road trip', '곡선이 많은 장거리 차량 이동', 'A winding long-distance drive', 'journey', [{...seoul, activity: 'visit'}, {latitude: 37.65, longitude: 129.05, activity: 'in passenger vehicle'}, {latitude: 36.02, longitude: 129.34, activity: 'in passenger vehicle'}, {...busan, activity: 'visit'}], 30),
  define('island-hopping', '섬 순회', 'Island hopping', '짧은 비행과 머무름의 반복', 'Repeated short flights and stays', 'journey', [{latitude: 35.68, longitude: 139.65, activity: 'visit'}, {latitude: 34.39, longitude: 132.46, activity: 'flying', gap: true}, {latitude: 33.59, longitude: 130.4, activity: 'flying', gap: true}, {latitude: 33.51, longitude: 126.49, activity: 'flying', gap: true}], 8),
  define('honeymoon', '다도시 신혼여행', 'Multi-city honeymoon', '목적지 체류가 긴 왕복 여행', 'A round trip with long destination stays', 'journey', [{...seoul, activity: 'visit'}, {latitude: 48.86, longitude: 2.35, activity: 'flying', hours: 12, gap: true}, {latitude: 45.44, longitude: 12.32, activity: 'in train', hours: 72}, {latitude: 41.9, longitude: 12.5, activity: 'in train', hours: 48}, {...seoul, activity: 'flying', hours: 12, gap: true}], 10),
  define('open-jaw', '오픈조 세계여행', 'Open-jaw world journey', '귀환 경로가 출국 경로와 다른 여행', 'A return route different from the outbound route', 'journey', [{...seoul, activity: 'visit'}, {latitude: 51.51, longitude: -0.13, activity: 'flying', gap: true}, {latitude: 40.71, longitude: -74, activity: 'flying', gap: true}, {latitude: 34.05, longitude: -118.24, activity: 'in train'}, {...seoul, activity: 'flying', gap: true}], 8),
  define('round-the-world', '지구 일주', 'Round the world', '여러 대륙과 날짜변경선을 통과', 'Multiple continents and the date line', 'journey', [{...seoul, activity: 'visit'}, {latitude: 1.35, longitude: 103.82, activity: 'flying', gap: true}, {latitude: -33.87, longitude: 151.21, activity: 'flying', gap: true}, {latitude: 37.77, longitude: -122.42, activity: 'flying', gap: true}, {latitude: 51.51, longitude: -0.13, activity: 'flying', gap: true}, {...seoul, activity: 'flying', gap: true}], 5),
  define('cross-border-rail', '국경 횡단 철도', 'Cross-border rail', '중간 정차가 많은 장거리 철도', 'A long rail journey with many stops', 'journey', [{latitude: 48.86, longitude: 2.35, activity: 'visit'}, {latitude: 50.85, longitude: 4.35, activity: 'in train'}, {latitude: 52.37, longitude: 4.9, activity: 'in train'}, {latitude: 52.52, longitude: 13.41, activity: 'in train'}, {latitude: 50.08, longitude: 14.44, activity: 'visit'}], 18),
  define('mixed-mobility', '혼합 마이크로모빌리티', 'Mixed micromobility', '도보·달리기·자전거·트램 전환', 'Walking, running, cycling, and tram changes', 'everyday', [{...seoul, activity: 'walking'}, {latitude: 37.58, longitude: 126.96, activity: 'running'}, {latitude: 37.6, longitude: 126.94, activity: 'cycling'}, {latitude: 37.62, longitude: 126.91, activity: 'in tram'}, {...seoul, activity: 'visit'}], 20),
  define('ski-season', '산악 스키 시즌', 'Mountain ski season', '고도와 이동 방향이 자주 바뀌는 경로', 'A route with frequent direction changes', 'journey', [{latitude: 46.82, longitude: 8.23, activity: 'visit'}, {latitude: 46.84, longitude: 8.28, activity: 'skiing'}, {latitude: 46.78, longitude: 8.32, activity: 'skiing'}, {latitude: 46.8, longitude: 8.2, activity: 'skiing'}, {latitude: 46.82, longitude: 8.23, activity: 'visit'}], 24),
  {id: 'urban-gps-canyon', title: {ko: '고밀도 도심 GPS', en: 'Dense urban GPS canyon'}, description: {ko: '고밀도 좌표와 단일 spike', en: 'Dense points and one isolated spike'}, category: 'edge-case', timeline: denseUrban()},
  define('tunnel-gaps', '터널과 통신 공백', 'Tunnel and signal gaps', '경로 중간 관측이 사라지는 이동', 'A route with missing observations', 'edge-case', [{...seoul, activity: 'in bus'}, {latitude: 37.72, longitude: 127.4, activity: 'in bus'}, {latitude: 37.75, longitude: 128.2, activity: 'in bus', gap: true}, {latitude: 37.75, longitude: 128.88, activity: 'visit'}], 8),
  {id: 'stationary-jitter', title: {ko: '장시간 위치 흔들림', en: 'Long stationary jitter'}, description: {ko: '한 장소의 미세한 GPS 변화', en: 'Small GPS changes at one place'}, category: 'edge-case', timeline: stationaryJitter()},
  define('date-line', '날짜변경선 왕복', 'Date-line round trip', '180도 경계를 지나는 최단 대권 경로', 'Shortest great-circle path across 180°', 'edge-case', [{latitude: 35.68, longitude: 139.65, activity: 'flying'}, {latitude: 21.31, longitude: -157.86, activity: 'flying', gap: true}, {latitude: 35.68, longitude: 139.65, activity: 'flying', gap: true}], 1),
  define('high-latitude', '고위도 여행', 'High-latitude journey', 'Mercator 한계 부근의 이동', 'Travel near the Mercator latitude limit', 'edge-case', [{latitude: 64.15, longitude: -21.94, activity: 'visit'}, {latitude: 69.65, longitude: 18.96, activity: 'flying', gap: true}, {latitude: 78.22, longitude: 15.65, activity: 'visit'}], 6),
  define('overlap-outlier', '중복과 이상점', 'Overlap and outlier', '중복 시각과 급격한 왕복 위치', 'Duplicate timestamps and a sudden return spike', 'edge-case', [{...seoul, activity: 'visit'}, {latitude: 37.57, longitude: 126.99, activity: 'walking'}, {latitude: 36.2, longitude: 128.1, activity: 'unknown'}, {latitude: 37.5701, longitude: 126.9901, activity: 'walking'}, {...seoul, activity: 'visit'}], 2),
  define('decade-hiatus', '여러 해와 장기 공백', 'Multi-year archive and hiatus', '활동 기간 사이에 긴 공백이 존재', 'Long gaps between active periods', 'edge-case', [{...seoul, activity: 'visit'}, {latitude: 35.18, longitude: 129.08, activity: 'in train', hours: 24}, {latitude: 35.18, longitude: 129.08, activity: 'visit', hours: 24 * 365 * 4, gap: true}, {...seoul, activity: 'flying', hours: 24, gap: true}], 4),
];

export const defaultSampleScenario = sampleScenarios.find((scenario) => scenario.id === 'metro-week')!;
export const sampleScenarioById = (id: string) => sampleScenarios.find((scenario) => scenario.id === id) ?? defaultSampleScenario;
