import tr from './dictionary.tr';
import en from './dictionary.en';

export type Locale = 'tr' | 'en';

export function getDictionary(locale: Locale) {
  return locale === 'en' ? en : tr;
}
