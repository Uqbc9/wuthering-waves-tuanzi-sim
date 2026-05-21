import championshipConfig from "../data/tuanzi_championship_2026.json";
import type { TrackConfig, TrackOption, TuanziConfig } from "./types";

export const defaultConfig = championshipConfig as TuanziConfig;

type NormalizedTrack = TrackConfig & {
  id: string;
  name: string;
};

function normalizeTrack(track: TrackConfig, index: number): NormalizedTrack {
  const id = String(track.id ?? `map_${index + 1}`).trim() || `map_${index + 1}`;
  const name = String(track.name ?? `Map ${index + 1}`).trim() || `Map ${index + 1}`;
  return {
    ...track,
    id,
    name,
  };
}

export function getTracks(config: TuanziConfig = defaultConfig): NormalizedTrack[] {
  const seen = new Set<string>();
  const tracks = [config.track, ...(config.tracks ?? [])];
  const normalized: NormalizedTrack[] = [];

  tracks.forEach((track, index) => {
    const item = normalizeTrack(track, index);
    if (seen.has(item.id)) {
      return;
    }
    seen.add(item.id);
    normalized.push(item);
  });

  return normalized;
}

export function getTrackOptions(config: TuanziConfig = defaultConfig): TrackOption[] {
  return getTracks(config).map((track) => ({
    id: track.id,
    name: track.name,
  }));
}

export function getDefaultTrackId(config: TuanziConfig = defaultConfig): string {
  return getTracks(config)[0]?.id ?? "map_1";
}

export function getTrackById(
  config: TuanziConfig,
  trackId: string | null | undefined,
): NormalizedTrack {
  const tracks = getTracks(config);
  return tracks.find((track) => track.id === trackId) ?? tracks[0] ?? normalizeTrack(config.track, 0);
}

export function configWithTrack(
  config: TuanziConfig,
  trackId: string | null | undefined,
): TuanziConfig {
  const track = getTrackById(config, trackId);
  return {
    ...config,
    assumptions: {
      ...config.assumptions,
      track_length: track.sequence.length - 1,
    },
    track: {
      ...track,
      sequence: [...track.sequence],
      mechanisms: Object.fromEntries(
        Object.entries(track.mechanisms).map(([marker, mechanism]) => [
          marker,
          { ...mechanism },
        ]),
      ),
    },
    tracks: config.tracks?.filter((item) => item.id !== track.id),
  };
}
