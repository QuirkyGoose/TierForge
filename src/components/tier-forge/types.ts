export interface TierRow {
  id: string;
  tierListId: string;
  label: string;
  color: string;
  order: number;
}

export interface TierItem {
  id: string;
  tierListId: string;
  rowId: string | null;
  name: string;
  imageUrl: string | null;
  addedBy: string;
  voteCount: number;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface TierList {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  accent: string;
  isLive: boolean;
  createdAt: string;
  updatedAt: string;
  rows: TierRow[];
  items: TierItem[];
  _count?: { items: number };
}

export interface TwitchConfig {
  id: string;
  channelName: string | null;
  botNickname: string | null;
  oauthToken: string | null;
  isListening: boolean;
  commandPrefix: string;
  allowViewersToAdd: boolean;
  allowViewersToMove: boolean;
  allowViewersToVote: boolean;
  autoStartOnBoot: boolean;
  lastConnectedAt: string | null;
  lastError: string | null;
}

export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  badges: string[];
  isPrivileged: boolean;
  isCommand: boolean;
  at: string;
}

export interface ChatCommand {
  username: string;
  command: string;
  args: string[];
  argStr: string;
  isPrivileged: boolean;
  at: string;
}

export interface TwitchStatus {
  message: string;
  level: "info" | "warn" | "error";
  at: string;
}

export interface TwitchEvent {
  type: string;
  channel: string;
  user: string;
  systemMsg: string;
  at: string;
}
