// Tipos compartidos que matchean el schema SQL

export type BandRole =
  | "owner" | "singer" | "bassist" | "drummer"
  | "guitarist" | "keys" | "fx" | "other";

export type SectionType =
  | "intro" | "verse" | "pre_chorus" | "chorus" | "bridge"
  | "solo" | "breakdown" | "interlude" | "outro" | "silence" | "other";

export type CueType =
  | "count_in" | "fill" | "hit" | "transition"
  | "tempo_change" | "mute" | "unmute" | "cue_band" | "note";

export interface Band {
  id: string;
  name: string;
  slug?: string;
  owner_id: string;
  description?: string;
  cover_color?: string;
  created_at: string;
  updated_at: string;
}

export interface BandMember {
  id: string;
  band_id: string;
  user_id: string;
  role: BandRole;
  display_name?: string;
  is_active: boolean;
  joined_at: string;
}

export interface Setlist {
  id: string;
  band_id: string;
  name: string;
  show_date?: string;
  venue?: string;
  notes?: string;
  is_archived: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface SetlistSong {
  id: string;
  setlist_id: string;
  song_id: string;
  position: number;
  transition_notes?: string;
  created_at: string;
}

export interface Song {
  id: string;
  band_id: string;
  title: string;
  artist?: string;
  key?: string;
  bpm: number;
  time_signature: string;
  program_change?: number;
  daw_session_name?: string;
  duration_seconds?: number;
  has_click_track: boolean;
  notes?: string;
  tags?: string[];
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface SongSection {
  id: string;
  song_id: string;
  section_type: SectionType;
  label?: string;
  order_index: number;
  start_bar: number;
  bar_count: number;
  start_time_seconds?: number;
}

export interface LyricLine {
  id: string;
  song_id: string;
  section_id?: string;
  order_index: number;
  text: string;
  start_time_seconds: number;
  hold_seconds?: number;
  is_chorus_emphasis: boolean;
}

export interface ChordChart {
  id: string;
  song_id: string;
  section_id?: string;
  order_index: number;
  chord_symbol: string;
  root_note: string;
  quality: string;
  bass_note?: string;
  start_bar: number;
  bar_count: number;
  start_time_seconds?: number;
}

export interface DrumCue {
  id: string;
  song_id: string;
  section_id?: string;
  order_index: number;
  cue_type: CueType;
  label?: string;
  start_bar: number;
  start_time_seconds?: number;
  duration_bars?: number;
  notes?: string;
}

// MIDI Cue mapping (note → label → timestamp)
// Lo guardamos como un campo JSON en songs o como tabla aparte.
// Por simplicidad: tabla aparte llamada midi_cues que agrego al schema
export interface MidiCue {
  id: string;
  song_id: string;
  midi_note: number;     // 0-127
  label: string;          // "Intro", "Verse 1", etc.
  jump_to_seconds: number;
  order_index: number;
}
