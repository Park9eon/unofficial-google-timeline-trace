import type {Map as MapLibreMap} from 'maplibre-gl';
import type {VideoConfig} from '@/domain/timeline';

export type MapRuntime = {
  revision?: number;
};

export const ONLINE_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const palette = {
  'night-pulse': {background: '#090d10', land: '#11181b', water: '#10232a', road: '#344044', text: '#aebabc', halo: '#090d10'},
  'paper-atlas': {background: '#eee8d9', land: '#e8dfcd', water: '#b9d4d3', road: '#b7ad98', text: '#454139', halo: '#eee8d9'},
  'mono-fog': {background: '#cad1d0', land: '#bec7c6', water: '#9cafb2', road: '#879392', text: '#293332', halo: '#cad1d0'},
  'deep-ocean': {background: '#07151e', land: '#0c2530', water: '#071923', road: '#2c7180', text: '#c5edf0', halo: '#07151e'},
  'forest-glow': {background: '#0c1713', land: '#14251d', water: '#122c30', road: '#456b57', text: '#d5e8d9', halo: '#0c1713'},
  'sunset-dusk': {background: '#21141e', land: '#2d1d29', water: '#192536', road: '#9a5e67', text: '#f0d8cf', halo: '#21141e'},
  blueprint: {background: '#07182d', land: '#0c2542', water: '#061321', road: '#3c77a8', text: '#d5ebff', halo: '#07182d'},
  'clean-light': {background: '#f4f6f3', land: '#ecefe9', water: '#c8dde4', road: '#b1bbb8', text: '#2d3736', halo: '#f4f6f3'},
} satisfies Record<VideoConfig['map']['stylePreset'], Record<string, string>>;

export const applyMapAppearance = (map: MapLibreMap, config: VideoConfig) => {
  const colors = palette[config.map.stylePreset];
  const custom = config.map.colors;
  const style = map.getStyle();
  for (const layer of style.layers ?? []) {
    const id = layer.id.toLowerCase();
    try {
      if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', custom.land);
      if (layer.type === 'fill') {
        map.setPaintProperty(layer.id, 'fill-color', id.includes('water') ? custom.water : custom.land);
      }
      if (layer.type === 'line') map.setPaintProperty(layer.id, 'line-color', id.includes('bound') ? custom.boundary : custom.road);
      if (layer.type === 'symbol') {
        const isPoi = id.includes('poi') || id.includes('shop') || id.includes('amenity');
        const isMinor = id.includes('minor') || id.includes('road');
        const hidden = config.map.labelDensity === 'none' || (config.map.labelDensity === 'major' && isMinor) || (!config.map.showPoi && isPoi);
        map.setLayoutProperty(layer.id, 'visibility', hidden ? 'none' : 'visible');
        if (!hidden) {
          map.setPaintProperty(layer.id, 'text-color', custom.text);
          map.setPaintProperty(layer.id, 'text-halo-color', colors.halo);
        }
      }
    } catch {}
  }
};
