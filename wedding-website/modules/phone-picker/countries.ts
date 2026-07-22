export interface Country {
    name: string;
    iso2: string;
    dial: string;
    placeholder?: string;
}

/** Convert an ISO-3166 alpha-2 code to its flag emoji (regional indicators). */
export function flagEmoji(iso2: string): string {
    return iso2
        .toUpperCase()
        .replace(/./g, (c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)));
}

/** ISO codes pinned to the top of picker lists. */
export const PRIORITY_ISO = ['IN', 'US', 'GB', 'CA', 'AE', 'AU'];

export const COUNTRIES: Country[] = [
    { name: 'Afghanistan', iso2: 'AF', dial: '93' },
    { name: 'Argentina', iso2: 'AR', dial: '54' },
    { name: 'Australia', iso2: 'AU', dial: '61', placeholder: '412 345 678' },
    { name: 'Austria', iso2: 'AT', dial: '43' },
    { name: 'Bahrain', iso2: 'BH', dial: '973' },
    { name: 'Bangladesh', iso2: 'BD', dial: '880' },
    { name: 'Belgium', iso2: 'BE', dial: '32' },
    { name: 'Brazil', iso2: 'BR', dial: '55', placeholder: '11 91234-5678' },
    { name: 'Bulgaria', iso2: 'BG', dial: '359' },
    { name: 'Cambodia', iso2: 'KH', dial: '855' },
    { name: 'Canada', iso2: 'CA', dial: '1', placeholder: '(416) 123-4567' },
    { name: 'Chile', iso2: 'CL', dial: '56' },
    { name: 'China', iso2: 'CN', dial: '86', placeholder: '131 2345 6789' },
    { name: 'Colombia', iso2: 'CO', dial: '57' },
    { name: 'Croatia', iso2: 'HR', dial: '385' },
    { name: 'Czech Republic', iso2: 'CZ', dial: '420' },
    { name: 'Denmark', iso2: 'DK', dial: '45' },
    { name: 'Egypt', iso2: 'EG', dial: '20' },
    { name: 'Estonia', iso2: 'EE', dial: '372' },
    { name: 'Ethiopia', iso2: 'ET', dial: '251' },
    { name: 'Fiji', iso2: 'FJ', dial: '679' },
    { name: 'Finland', iso2: 'FI', dial: '358' },
    { name: 'France', iso2: 'FR', dial: '33', placeholder: '6 12 34 56 78' },
    { name: 'Germany', iso2: 'DE', dial: '49', placeholder: '151 23456789' },
    { name: 'Ghana', iso2: 'GH', dial: '233' },
    { name: 'Greece', iso2: 'GR', dial: '30' },
    { name: 'Hong Kong', iso2: 'HK', dial: '852' },
    { name: 'Hungary', iso2: 'HU', dial: '36' },
    { name: 'Iceland', iso2: 'IS', dial: '354' },
    { name: 'India', iso2: 'IN', dial: '91', placeholder: '98765 43210' },
    { name: 'Indonesia', iso2: 'ID', dial: '62' },
    { name: 'Iran', iso2: 'IR', dial: '98' },
    { name: 'Iraq', iso2: 'IQ', dial: '964' },
    { name: 'Ireland', iso2: 'IE', dial: '353' },
    { name: 'Israel', iso2: 'IL', dial: '972' },
    { name: 'Italy', iso2: 'IT', dial: '39', placeholder: '312 345 6789' },
    { name: 'Jamaica', iso2: 'JM', dial: '1' },
    { name: 'Japan', iso2: 'JP', dial: '81', placeholder: '90-1234-5678' },
    { name: 'Jordan', iso2: 'JO', dial: '962' },
    { name: 'Kenya', iso2: 'KE', dial: '254' },
    { name: 'Kuwait', iso2: 'KW', dial: '965' },
    { name: 'Latvia', iso2: 'LV', dial: '371' },
    { name: 'Lebanon', iso2: 'LB', dial: '961' },
    { name: 'Lithuania', iso2: 'LT', dial: '370' },
    { name: 'Luxembourg', iso2: 'LU', dial: '352' },
    { name: 'Malaysia', iso2: 'MY', dial: '60' },
    { name: 'Maldives', iso2: 'MV', dial: '960' },
    { name: 'Malta', iso2: 'MT', dial: '356' },
    { name: 'Mexico', iso2: 'MX', dial: '52', placeholder: '55 1234 5678' },
    { name: 'Morocco', iso2: 'MA', dial: '212' },
    { name: 'Myanmar', iso2: 'MM', dial: '95' },
    { name: 'Nepal', iso2: 'NP', dial: '977' },
    { name: 'Netherlands', iso2: 'NL', dial: '31', placeholder: '6 12345678' },
    { name: 'New Zealand', iso2: 'NZ', dial: '64' },
    { name: 'Nigeria', iso2: 'NG', dial: '234' },
    { name: 'Norway', iso2: 'NO', dial: '47' },
    { name: 'Oman', iso2: 'OM', dial: '968' },
    { name: 'Pakistan', iso2: 'PK', dial: '92', placeholder: '301 2345678' },
    { name: 'Peru', iso2: 'PE', dial: '51' },
    { name: 'Philippines', iso2: 'PH', dial: '63', placeholder: '917 123 4567' },
    { name: 'Poland', iso2: 'PL', dial: '48' },
    { name: 'Portugal', iso2: 'PT', dial: '351' },
    { name: 'Qatar', iso2: 'QA', dial: '974' },
    { name: 'Romania', iso2: 'RO', dial: '40' },
    { name: 'Russia', iso2: 'RU', dial: '7' },
    { name: 'Saudi Arabia', iso2: 'SA', dial: '966', placeholder: '51 234 5678' },
    { name: 'Serbia', iso2: 'RS', dial: '381' },
    { name: 'Singapore', iso2: 'SG', dial: '65', placeholder: '8123 4567' },
    { name: 'Slovakia', iso2: 'SK', dial: '421' },
    { name: 'Slovenia', iso2: 'SI', dial: '386' },
    { name: 'South Africa', iso2: 'ZA', dial: '27', placeholder: '71 123 4567' },
    { name: 'South Korea', iso2: 'KR', dial: '82', placeholder: '10-1234-5678' },
    { name: 'Spain', iso2: 'ES', dial: '34', placeholder: '612 34 56 78' },
    { name: 'Sri Lanka', iso2: 'LK', dial: '94' },
    { name: 'Sweden', iso2: 'SE', dial: '46' },
    { name: 'Switzerland', iso2: 'CH', dial: '41' },
    { name: 'Taiwan', iso2: 'TW', dial: '886' },
    { name: 'Tanzania', iso2: 'TZ', dial: '255' },
    { name: 'Thailand', iso2: 'TH', dial: '66', placeholder: '81 234 5678' },
    { name: 'Turkey', iso2: 'TR', dial: '90', placeholder: '501 234 56 78' },
    { name: 'Uganda', iso2: 'UG', dial: '256' },
    { name: 'Ukraine', iso2: 'UA', dial: '380' },
    { name: 'United Arab Emirates', iso2: 'AE', dial: '971', placeholder: '50 123 4567' },
    { name: 'United Kingdom', iso2: 'GB', dial: '44', placeholder: '7400 123456' },
    { name: 'United States', iso2: 'US', dial: '1', placeholder: '(555) 123-4567' },
    { name: 'Uruguay', iso2: 'UY', dial: '598' },
    { name: 'Venezuela', iso2: 'VE', dial: '58' },
    { name: 'Vietnam', iso2: 'VN', dial: '84', placeholder: '91 234 56 78' },
    { name: 'Zambia', iso2: 'ZM', dial: '260' },
    { name: 'Zimbabwe', iso2: 'ZW', dial: '263' },
];

export const DEFAULT_COUNTRY: Country =
    COUNTRIES.find((c) => c.iso2 === 'IN') ?? COUNTRIES[0];

/** Case-insensitive match on name, ISO code, or dial code (with or without '+'). */
export function matchesCountry(country: Country, query: string): boolean {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    if (!q) return true;
    return (
        country.name.toLowerCase().includes(q) ||
        country.iso2.toLowerCase() === q ||
        country.dial.startsWith(q)
    );
}

/** Priority countries first (in PRIORITY_ISO order), the rest alphabetical. */
export function sortedCountries(): Country[] {
    const priority = PRIORITY_ISO
        .map((iso) => COUNTRIES.find((c) => c.iso2 === iso))
        .filter((c): c is Country => Boolean(c));
    const rest = COUNTRIES.filter((c) => !PRIORITY_ISO.includes(c.iso2));
    return [...priority, ...rest];
}
