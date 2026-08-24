'use client';

import {useEffect, type ReactNode} from 'react';
import {createInstance} from 'i18next';
import {I18nextProvider, initReactI18next} from 'react-i18next';
import {loadStoredSettings} from '@/storage/settings';
import {resources} from './resources';

const instance = createInstance();
void instance.use(initReactI18next).init({
  resources,
  lng: 'ko',
  fallbackLng: 'ko',
  supportedLngs: ['ko', 'en'],
  interpolation: {escapeValue: false},
  initAsync: false,
});

export function I18nProvider({children}: {children: ReactNode}) {
  useEffect(() => {
    const locale = loadStoredSettings().locale;
    document.documentElement.lang = locale;
    void instance.changeLanguage(locale);
  }, []);
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

export {instance as appI18n};
