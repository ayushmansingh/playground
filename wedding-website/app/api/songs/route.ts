import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            spotify_track_id,
            track_name,
            artist_name,
            album_art_url,
            guest_name,
            guest_message,
        } = body;

        if (!spotify_track_id || !track_name || !guest_name) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        // Demo mode if Supabase is not configured
        if (!supabase) {
            return NextResponse.json({
                success: true,
                demoMode: true,
                data: {
                    id: 'demo-' + Date.now(),
                    spotify_track_id,
                    track_name,
                    artist_name,
                    album_art_url,
                    guest_name,
                    guest_message,
                }
            });
        }

        const { data, error } = await supabase
            .from('song_recommendations')
            .insert({
                spotify_track_id,
                track_name,
                artist_name,
                album_art_url,
                guest_name,
                guest_message,
            })
            .select()
            .single();

        if (error) {
            console.error('Database error:', error);
            return NextResponse.json({ error: 'Failed to save recommendation' }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET() {
    try {
        const supabase = await createClient();

        // Demo mode if Supabase is not configured
        if (!supabase) {
            return NextResponse.json({
                songs: [],
                demoMode: true,
            });
        }

        const { data, error } = await supabase
            .from('song_recommendations')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Database error:', error);
            return NextResponse.json({ error: 'Failed to fetch recommendations' }, { status: 500 });
        }

        return NextResponse.json({ songs: data });
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
