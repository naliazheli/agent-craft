export interface SeedHackerOneProgram {
  handle: string;
  name: string;
}

export const HACKERONE_SEED_FETCH_LIMIT = 30;
export const HACKERONE_SEED_SCOPE_LIMIT = 100;

export const HACKERONE_SEED_PROGRAMS: SeedHackerOneProgram[] = [
  { handle: 'security', name: 'HackerOne' },
  { handle: 'phabricator', name: 'Phabricator' },
  { handle: 'django', name: 'Django' },
  { handle: 'cloudflare', name: 'Cloudflare Public Bug Bounty' },
  { handle: 'wordpress', name: 'WordPress' },
  { handle: 'vimeo', name: 'Vimeo' },
  { handle: 'linkedin', name: 'LinkedIn' },
  { handle: 'priceline', name: 'Priceline' },
  { handle: 'x', name: 'X / xAI' },
  { handle: 'basecamp', name: 'Basecamp' },
  { handle: 'slack', name: 'Slack' },
  { handle: 'tinder', name: 'Tinder' },
  { handle: 'coinbase', name: 'Coinbase' },
  { handle: 'automattic', name: 'Automattic' },
  { handle: 'att', name: 'AT&T' },
  { handle: 'gitlab', name: 'GitLab' },
  { handle: 'greenhouse', name: 'Greenhouse.io' },
  { handle: 'uber', name: 'Uber' },
  { handle: 'adobe', name: 'Adobe' },
  { handle: 'coinmate', name: 'CoinMate.io' },
  { handle: 'snapchat', name: 'Snapchat' },
  { handle: 'yelp', name: 'Yelp' },
  { handle: 'ui', name: 'Ubiquiti Inc.' },
  { handle: 'airtable', name: 'Airtable' },
  { handle: 'bookingcom', name: 'Booking.com' },
  { handle: 'airbnb', name: 'Airbnb' },
  { handle: 'kayak', name: 'KAYAK' },
  { handle: 'moneybird', name: 'Moneybird' },
  { handle: 'mapbox', name: 'Mapbox' },
  { handle: 'shopify', name: 'Shopify' },
];

export const HACKERONE_SEED_PROGRAM_HANDLES = HACKERONE_SEED_PROGRAMS.map(
  (program) => program.handle,
);
