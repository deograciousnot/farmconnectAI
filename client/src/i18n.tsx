import { createContext, useContext } from 'react';

// The EN/SW switch sets the app's own language. The AI's advice follows the language the person
// actually spoke or typed (see SellView), so nobody has to change a setting to be answered in their language.
export type UiLang = 'en' | 'sw';
export type ReplyLang = 'en' | 'sw' | 'mixed';

export const LangContext = createContext<UiLang>('en');

/** `t('English', 'Kiswahili')`: both versions sit next to each other, so they're easy to review and keep in sync. */
export function useT() {
  const lang = useContext(LangContext);
  const t = (en: string, sw: string) => (lang === 'sw' ? sw : en);
  return Object.assign(t, { lang });
}

const BUSINESS_TYPES: Record<string, [string, string]> = {
  reseller: ['reseller', 'mchuuzi'],
  wholesaler: ['wholesaler', 'mfanyabiashara wa jumla'],
  retailer: ['retailer', 'muuzaji wa rejareja'],
  processor: ['processor', 'kiwanda cha usindikaji'],
  institution: ['institution', 'taasisi'],
  exporter: ['exporter', 'msafirishaji nje']
};
export const businessTypeLabel = (type: string, lang: UiLang) => BUSINESS_TYPES[type]?.[lang === 'sw' ? 1 : 0] ?? type;

export const replyLangLabel = (l: ReplyLang, ui: UiLang) =>
  ({ en: ui === 'sw' ? 'Kiingereza' : 'English', sw: 'Kiswahili', mixed: ui === 'sw' ? 'Kiswahili + Kiingereza' : 'Kiswahili + English' })[l];
