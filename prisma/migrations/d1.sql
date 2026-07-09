-- D1 Migration: Tier Forge — Tier list system with Twitch integration
-- Run with: wrangler d1 execute tierforge --file=prisma/migrations/d1.sql

-- TierList table
CREATE TABLE IF NOT EXISTS TierList (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL UNIQUE,
  accent TEXT NOT NULL DEFAULT '#d4a853',
  isLive INTEGER NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- TierRow table (S/A/B/C/D/F rows per tier list)
CREATE TABLE IF NOT EXISTS TierRow (
  id TEXT PRIMARY KEY,
  tierListId TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  FOREIGN KEY (tierListId) REFERENCES TierList(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_TierRow_tierListId ON TierRow(tierListId);

-- TierItem table
CREATE TABLE IF NOT EXISTS TierItem (
  id TEXT PRIMARY KEY,
  tierListId TEXT NOT NULL,
  rowId TEXT,
  name TEXT NOT NULL,
  imageUrl TEXT,
  addedBy TEXT NOT NULL DEFAULT 'streamer',
  voteCount INTEGER NOT NULL DEFAULT 0,
  "order" INTEGER NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tierListId) REFERENCES TierList(id) ON DELETE CASCADE,
  FOREIGN KEY (rowId) REFERENCES TierRow(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_TierItem_tierListId ON TierItem(tierListId);
CREATE INDEX IF NOT EXISTS idx_TierItem_rowId ON TierItem(rowId);

-- TwitchConfig table (singleton)
CREATE TABLE IF NOT EXISTS TwitchConfig (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  channelName TEXT,
  botNickname TEXT DEFAULT 'tierforge_bot',
  oauthToken TEXT,
  isListening INTEGER NOT NULL DEFAULT 0,
  commandPrefix TEXT NOT NULL DEFAULT '!',
  allowViewersToAdd INTEGER NOT NULL DEFAULT 1,
  allowViewersToMove INTEGER NOT NULL DEFAULT 0,
  allowViewersToVote INTEGER NOT NULL DEFAULT 1,
  autoStartOnBoot INTEGER NOT NULL DEFAULT 0,
  lastConnectedAt DATETIME,
  lastError TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ChatLog table
CREATE TABLE IF NOT EXISTS ChatLog (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  command TEXT,
  tierListId TEXT,
  isCommand INTEGER NOT NULL DEFAULT 0,
  isActioned INTEGER NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ChatLog_createdAt ON ChatLog(createdAt);
CREATE INDEX IF NOT EXISTS idx_ChatLog_tierListId ON ChatLog(tierListId);

-- VoteRecord table (one vote per user per item)
CREATE TABLE IF NOT EXISTS VoteRecord (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  itemId TEXT NOT NULL,
  tierListId TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (itemId) REFERENCES TierItem(id) ON DELETE CASCADE,
  FOREIGN KEY (tierListId) REFERENCES TierList(id) ON DELETE CASCADE,
  UNIQUE(username, itemId)
);
CREATE INDEX IF NOT EXISTS idx_VoteRecord_itemId ON VoteRecord(itemId);
CREATE INDEX IF NOT EXISTS idx_VoteRecord_tierListId ON VoteRecord(tierListId);
