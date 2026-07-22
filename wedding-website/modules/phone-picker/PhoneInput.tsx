'use client';

import { useState } from 'react';
import CountryCodePicker from './CountryCodePicker';
import { Country, DEFAULT_COUNTRY } from './countries';

interface PhoneInputProps {
    onChange?: (fullNumber: string, country: Country) => void;
}

export default function PhoneInput({ onChange }: PhoneInputProps) {
    const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
    const [number, setNumber] = useState('');

    const emit = (nextCountry: Country, nextNumber: string) => {
        const digits = nextNumber.replace(/\D/g, '');
        onChange?.(digits ? `+${nextCountry.dial}${digits}` : '', nextCountry);
    };

    const handleCountryChange = (next: Country) => {
        setCountry(next);
        emit(next, number);
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Allow digits and common separators only
        const cleaned = e.target.value.replace(/[^\d\s()-]/g, '');
        setNumber(cleaned);
        emit(country, cleaned);
    };

    return (
        <div className="flex">
            <CountryCodePicker value={country} onChange={handleCountryChange} attached />
            <input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={number}
                onChange={handleNumberChange}
                placeholder={country.placeholder ?? '123 456 7890'}
                aria-label="Phone number"
                className="w-full rounded-r-lg border border-gold/40 bg-cream px-3 py-2.5 text-ink placeholder:text-ink-soft/60 transition-colors hover:border-gold focus:outline-none focus-visible:outline-2"
            />
        </div>
    );
}
