export interface SongRecommendation {
    id: string;
    spotify_track_id: string;
    track_name: string;
    artist_name: string;
    album_art_url: string | null;
    guest_name: string;
    guest_message: string | null;
    created_at: string;
}

export interface Album {
    id: string;
    name: string;
    description: string | null;
    cover_url: string | null;
    is_private: boolean;
    created_at: string;
}

export interface Photo {
    id: string;
    album_id: string;
    storage_path: string;
    caption: string | null;
    uploaded_by: string | null;
    created_at: string;
}

export interface RSVP {
    id: string;
    guest_email: string;
    guest_name: string;
    attending: boolean | null;
    plus_one: boolean;
    dietary_restrictions: string | null;
    created_at: string;
}

export interface Database {
    public: {
        Tables: {
            song_recommendations: {
                Row: SongRecommendation;
                Insert: Omit<SongRecommendation, 'id' | 'created_at'>;
                Update: Partial<Omit<SongRecommendation, 'id' | 'created_at'>>;
            };
            albums: {
                Row: Album;
                Insert: Omit<Album, 'id' | 'created_at'>;
                Update: Partial<Omit<Album, 'id' | 'created_at'>>;
            };
            photos: {
                Row: Photo;
                Insert: Omit<Photo, 'id' | 'created_at'>;
                Update: Partial<Omit<Photo, 'id' | 'created_at'>>;
            };
            rsvps: {
                Row: RSVP;
                Insert: Omit<RSVP, 'id' | 'created_at'>;
                Update: Partial<Omit<RSVP, 'id' | 'created_at'>>;
            };
        };
    };
}
