export type InterruptionType =
  | 'captcha'
  | 'login'
  | 'popup'
  | 'age_verify'
  | 'paywall'
  | 'newsletter'
  | 'ad'
  | 'other';

export type CaptchaSubType =
  | 'recaptcha_v2'
  | 'recaptcha_v3'
  | 'hcaptcha'
  | 'cloudflare_turnstile'
  | 'slide_verify'
  | 'sms_verify'
  | 'image_select'
  | 'text_input';

export type LoginSubType = 'full_page' | 'modal' | 'iframe';

export type PopupSubType =
  | 'cookie_consent'
  | 'newsletter'
  | 'notification'
  | 'discount'
  | 'age_verify'
  | 'paywall';

export type InterruptionSubType = CaptchaSubType | LoginSubType | PopupSubType | string;

export type InterruptionTrigger = 'auto_popup' | 'page_load' | 'user_action';

export interface CollectionEntry {
  id: string;
  timestamp: string;
  type: InterruptionType;
  subType: InterruptionSubType;
  page: {
    url: string;
    domain: string;
    path: string;
    title: string;
  };
  element: {
    selector: string;
    xpath: string;
    tagName: string;
    html: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    isIframe: boolean;
    iframeSrc?: string;
    parentSelector?: string;
  };
  context: {
    trigger: InterruptionTrigger;
    isVisible: boolean;
    zIndex: number;
    hasOverlay: boolean;
    overlaySelector?: string;
  };
}

export interface CollectionSession {
  sessionId: string;
  startedAt: string;
  stoppedAt: string;
  totalPages: number;
  collections: CollectionEntry[];
}

export interface InterruptionRule {
  name: string;
  domains: string[];
  paths?: string[];
  selectors: string[];
  type: InterruptionType;
  subType: string;
  confidence: number;
}

export const INTERRUPTION_CATEGORIES: Record<
  InterruptionType,
  { label: string; subTypes: string[] }
> = {
  captcha: {
    label: 'Captcha',
    subTypes: [
      'recaptcha_v2',
      'recaptcha_v3',
      'hcaptcha',
      'cloudflare_turnstile',
      'slide_verify',
      'sms_verify',
      'image_select',
      'text_input',
    ],
  },
  login: {
    label: 'Login',
    subTypes: ['full_page', 'modal', 'iframe'],
  },
  popup: {
    label: 'Popup',
    subTypes: ['cookie_consent', 'newsletter', 'notification', 'discount'],
  },
  age_verify: {
    label: 'Age Verify',
    subTypes: [],
  },
  paywall: {
    label: 'Paywall',
    subTypes: [],
  },
  newsletter: {
    label: 'Newsletter',
    subTypes: [],
  },
  ad: {
    label: 'Ad',
    subTypes: [],
  },
  other: {
    label: 'Other',
    subTypes: [],
  },
};

export const INTERRUPTION_TYPES_LIST = Object.entries(INTERRUPTION_CATEGORIES).flatMap(
  ([type, cat]) => {
    if (cat.subTypes.length === 0)
      return [{ type: type as InterruptionType, subType: '', label: cat.label }];
    return cat.subTypes.map((st) => ({
      type: type as InterruptionType,
      subType: st,
      label: `${cat.label}: ${st.replace(/_/g, ' ')}`,
    }));
  }
);
