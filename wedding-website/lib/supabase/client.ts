import { createBrowserClient } from '@supabase/ssr';

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Return null if credentials are not configured
    if (!url || !key || url === 'your_supabase_project_url') {
        return null;
    }

    if (!supabaseClient) {
        supabaseClient = createBrowserClient(url, key);
    }

    return supabaseClient;
}

export function isSupabaseConfigured(): boolean {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return !!(url && key && url !== 'your_supabase_project_url');
}
