import type {MetadataRoute} from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Unofficial Google Timeline Trace',
    short_name: 'Timeline Trace',
    description: 'Google timeline Film Studio',
    start_url: '/',
    display: 'standalone',
    background_color: '#090d10',
    theme_color: '#090d10',
    icons: [{src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any'}],
  };
}
