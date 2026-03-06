export type Tradition = "islam" | "christianity" | "judaism";

export type ModePreference = "voice_only" | "voice_then_video";

export interface UserProfile {
  id: string;
  pseudonym: string;
  languages: string[];
  traditions: Tradition[];
}

export interface QueueJoinRequest {
  modePreference: ModePreference;
  language: string;
  intentTags: string[];
}

export interface QueueStatus {
  queued: boolean;
  queueId?: string;
  joinedAt?: string;
}

export interface HealthResponse {
  ok: true;
  service: string;
  timestamp: string;
}
