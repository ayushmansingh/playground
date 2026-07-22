'use client';

import { useState } from 'react';
import PhoneInput from '@/modules/phone-picker/PhoneInput';
import CountryCodePicker from '@/modules/phone-picker/CountryCodePicker';
import BottomSheetPicker from '@/modules/phone-picker/BottomSheetPicker';
import InlineCountryList from '@/modules/phone-picker/InlineCountryList';
import { Country, DEFAULT_COUNTRY } from '@/modules/phone-picker/countries';

function Example({ title, description, children }: {
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-2xl border border-gold/20 bg-parchment-light/60 p-6 md:p-8">
            <h2 className="font-display text-2xl text-maroon">{title}</h2>
            <p className="mb-6 mt-1 text-sm text-ink-soft">{description}</p>
            {children}
        </section>
    );
}

export default function PhonePickerExamplesPage() {
    const [fullNumber, setFullNumber] = useState('');
    const [dropdownCountry, setDropdownCountry] = useState<Country>(DEFAULT_COUNTRY);
    const [sheetCountry, setSheetCountry] = useState<Country>(DEFAULT_COUNTRY);
    const [inlineCountry, setInlineCountry] = useState<Country>(DEFAULT_COUNTRY);

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-4 pb-24 pt-28">
            <header className="mb-10 text-center">
                <h1 className="font-display text-4xl text-maroon md:text-5xl">
                    Phone Code Picker
                </h1>
                <p className="mt-3 text-ink-soft">
                    Four country-code picker patterns, each backed by the same searchable country list.
                </p>
            </header>

            <div className="space-y-8">
                <Example
                    title="1. Full phone input"
                    description="Dropdown picker attached to a tel input. The placeholder follows the selected country's local format, and the combined E.164 number is emitted on change."
                >
                    <PhoneInput onChange={setFullNumber} />
                    <p className="mt-3 text-sm text-ink-soft">
                        Value: <span className="font-medium text-ink">{fullNumber || '—'}</span>
                    </p>
                </Example>

                <Example
                    title="2. Standalone dropdown with search"
                    description="Classic desktop pattern — a compact flag + dial-code trigger opens a searchable list with keyboard navigation (↑ ↓ Enter Esc). Suggested countries are pinned above the divider."
                >
                    <CountryCodePicker value={dropdownCountry} onChange={setDropdownCountry} />
                    <p className="mt-3 text-sm text-ink-soft">
                        Selected: <span className="font-medium text-ink">{dropdownCountry.name} (+{dropdownCountry.dial})</span>
                    </p>
                </Example>

                <Example
                    title="3. Bottom sheet (mobile)"
                    description="The trigger opens a bottom sheet with a search bar, a Suggested section, and the full list grouped alphabetically — the pattern most native apps use."
                >
                    <BottomSheetPicker value={sheetCountry} onChange={setSheetCountry} />
                </Example>

                <Example
                    title="4. Inline filterable list"
                    description="No popover — the list is always visible with radio-style selection. Suits a settings panel or a dedicated wizard step."
                >
                    <InlineCountryList value={inlineCountry} onChange={setInlineCountry} />
                    <p className="mt-3 text-sm text-ink-soft">
                        Selected: <span className="font-medium text-ink">{inlineCountry.name} (+{inlineCountry.dial})</span>
                    </p>
                </Example>
            </div>
        </div>
    );
}
