export const DEFAULT_BROWSER_PARAMS = [
  '--app=data:text/html, "Loading..."',
  '--window-size=1600,900',
  '--disable-features=IsolateOrigins',
  '--disable-features=BlockInsecurePrivateNetworkRequests',
  '--allow-file-access-from-files',
  '--disable-extensions',
  '--disable-automation',
];
export const IGNORE_DEFAULT_PARAMS = [
  '--enable-automation',
  '--disable-site-isolation-trials',
  '--disable-blink-features=AutomationControlled',
  `--enable-blink-features=IdleDetection`
];

export const UNDERAGE_CHECK = /([^!$£'`‘\./|\d\w-+]1[1-7][^+:/\%\d\w'|])|\b(high.school|teen|teenager)/i;
export const ZOO_CHECK = /(ζ)|(zeta)|(zoo(sex|phile[^s]|positivity|.friend))/i;
export const PEDO_CHECK = / (📛|🍭)/i;
