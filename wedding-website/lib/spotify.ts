const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

interface SpotifyCredentials {
    access_token: string;
    token_type: string;
    expires_in: number;
}

interface SpotifyTrack {
    id: string;
    name: string;
    artists: { name: string }[];
    album: {
        name: string;
        images: { url: string; width: number; height: number }[];
    };
    duration_ms: number;
    preview_url: string | null;
    external_urls: { spotify: string };
}

interface SpotifySearchResult {
    tracks: {
        items: SpotifyTrack[];
    };
}

// Get access token using Client Credentials flow (for searching)
async function getClientCredentialsToken(): Promise<string> {
    const clientId = process.env.SPOTIFY_CLIENT_ID!;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;

    const response = await fetch(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
    });

    const data: SpotifyCredentials = await response.json();
    return data.access_token;
}

export async function searchTracks(query: string, limit = 10): Promise<SpotifyTrack[]> {
    const token = await getClientCredentialsToken();

    const response = await fetch(
        `${SPOTIFY_API_URL}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );

    const data: SpotifySearchResult = await response.json();
    return data.tracks?.items || [];
}

export interface FormattedTrack {
    id: string;
    name: string;
    artist: string;
    album: string;
    albumArt: string;
    duration: string;
    previewUrl: string | null;
    spotifyUrl: string;
}

export function formatTrack(track: SpotifyTrack): FormattedTrack {
    const minutes = Math.floor(track.duration_ms / 60000);
    const seconds = Math.floor((track.duration_ms % 60000) / 1000);

    return {
        id: track.id,
        name: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        album: track.album.name,
        albumArt: track.album.images[0]?.url || '',
        duration: `${minutes}:${seconds.toString().padStart(2, '0')}`,
        previewUrl: track.preview_url,
        spotifyUrl: track.external_urls.spotify,
    };
}

export async function searchAndFormatTracks(query: string): Promise<FormattedTrack[]> {
    const tracks = await searchTracks(query);
    return tracks.map(formatTrack);
}
