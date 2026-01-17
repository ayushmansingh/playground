import { NextResponse } from 'next/server';

// Demo tracks for when Spotify is not configured
const demoTracks = [
    {
        id: 'demo-1',
        name: 'Perfect',
        artist: 'Ed Sheeran',
        album: '÷ (Divide)',
        albumArt: '',
        duration: '4:23',
        previewUrl: null,
        spotifyUrl: 'https://open.spotify.com',
    },
    {
        id: 'demo-2',
        name: 'Tum Hi Ho',
        artist: 'Arijit Singh',
        album: 'Aashiqui 2',
        albumArt: '',
        duration: '4:22',
        previewUrl: null,
        spotifyUrl: 'https://open.spotify.com',
    },
    {
        id: 'demo-3',
        name: 'Thinking Out Loud',
        artist: 'Ed Sheeran',
        album: 'x (Multiply)',
        albumArt: '',
        duration: '4:41',
        previewUrl: null,
        spotifyUrl: 'https://open.spotify.com',
    },
    {
        id: 'demo-4',
        name: 'All of Me',
        artist: 'John Legend',
        album: 'Love in the Future',
        albumArt: '',
        duration: '4:29',
        previewUrl: null,
        spotifyUrl: 'https://open.spotify.com',
    },
    {
        id: 'demo-5',
        name: 'A Thousand Years',
        artist: 'Christina Perri',
        album: 'The Twilight Saga',
        albumArt: '',
        duration: '4:45',
        previewUrl: null,
        spotifyUrl: 'https://open.spotify.com',
    },
];

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
    }

    const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
    const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    // Demo mode if Spotify is not configured
    if (!spotifyClientId || !spotifyClientSecret) {
        const filteredTracks = demoTracks.filter(
            (track) =>
                track.name.toLowerCase().includes(query.toLowerCase()) ||
                track.artist.toLowerCase().includes(query.toLowerCase())
        );
        return NextResponse.json({
            tracks: filteredTracks.length > 0 ? filteredTracks : demoTracks.slice(0, 3),
            demoMode: true,
        });
    }

    try {
        const { searchAndFormatTracks } = await import('@/lib/spotify');
        const tracks = await searchAndFormatTracks(query);
        return NextResponse.json({ tracks });
    } catch (error) {
        console.error('Spotify search error:', error);
        // Fallback to demo tracks on error
        return NextResponse.json({
            tracks: demoTracks.slice(0, 3),
            demoMode: true,
        });
    }
}
