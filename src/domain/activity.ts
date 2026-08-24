import type {ActivityType, SupportedLocale} from './timeline';

const labels: Record<SupportedLocale, Record<string, string>> = {
  ko: {
    walking: '도보', running: '달리기', cycling: '자전거',
    'in subway': '지하철', 'in bus': '버스', 'in passenger vehicle': '자동차',
    'in train': '기차', 'in tram': '트램', motorcycling: '오토바이',
    skiing: '스키', flying: '비행', visit: '머무는 중', unknown: '이동 중',
  },
  en: {
    walking: 'Walking', running: 'Running', cycling: 'Cycling',
    'in subway': 'Subway', 'in bus': 'Bus', 'in passenger vehicle': 'Driving',
    'in train': 'Train', 'in tram': 'Tram', motorcycling: 'Motorcycle',
    skiing: 'Skiing', flying: 'Flying', visit: 'Staying', unknown: 'Moving',
  },
};

export const activityLabel = (activity: ActivityType, locale: SupportedLocale = 'ko') => labels[locale][activity] ?? activity;

export const activityEmoji = (activity: ActivityType) => {
  if (activity === 'walking') return '🚶';
  if (activity === 'running') return '🏃';
  if (activity === 'cycling') return '🚲';
  if (activity === 'flying') return '✈️';
  if (activity === 'in subway') return '🚇';
  if (activity === 'in train') return '🚆';
  if (activity === 'in tram') return '🚋';
  if (activity === 'in bus') return '🚌';
  if (activity === 'motorcycling') return '🏍️';
  if (activity === 'skiing') return '⛷️';
  if (activity.includes('vehicle')) return '🚗';
  if (activity === 'visit') return '📍';
  return '🧭';
};
