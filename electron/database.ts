import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface Viewer {
  id: string;
  username: string;
  displayName: string;
}

export interface DbChatMessage {
  id: string;
  userId: string;
  channelId: string;
  message: string;
  timestamp: string;
  color?: string;
  badges: string;
  isFirstMessage: boolean;
  isReturningChatter: boolean;
  isHighlighted: boolean;
  bits?: number;
  replyParentMessageId?: string;
  emoteOffsets?: string;
  isDeleted?: boolean;
}

export interface DbSubscriptionEvent {
  id: string;
  type: string;
  userId: string;
  channelId: string;
  timestamp: string;
  tier: string;
  message?: string;
  cumulativeMonths?: number;
  streakMonths?: number;
  durationMonths?: number;
  isGift?: boolean;
  gifterUserId?: string;
  amount?: number;
}

class DatabaseService {
  private db: Database.Database | null = null;

  initialize() {
    // Create database directory in user data folder
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'warden-studio.db');

    // Ensure the directory exists
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    
    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');
    
    this.createTables();
  }

  private createTables() {
    if (!this.db) return;

    // Create viewers table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS viewers (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        displayName TEXT NOT NULL
      )
    `);

    // Create index on username for faster lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_viewers_username 
      ON viewers(username)
    `);

    // Create messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        channelId TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        color TEXT,
        badges TEXT NOT NULL,
        isFirstMessage INTEGER NOT NULL DEFAULT 0,
        isReturningChatter INTEGER NOT NULL DEFAULT 0,
        isHighlighted INTEGER NOT NULL DEFAULT 0,
        bits INTEGER,
        replyParentMessageId TEXT,
        emoteOffsets TEXT,
        isDeleted INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Create index on timestamp for faster chronological queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
      ON messages(timestamp)
    `);

    // Create index on userId for faster user-specific queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_userId 
      ON messages(userId)
    `);

    // Create index on channelId for faster channel-specific queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_channelId 
      ON messages(channelId)
    `);

    // Create subscriptions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        userId TEXT NOT NULL,
        channelId TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        tier TEXT NOT NULL,
        message TEXT,
        cumulativeMonths INTEGER,
        streakMonths INTEGER,
        durationMonths INTEGER,
        isGift INTEGER NOT NULL DEFAULT 0,
        gifterUserId TEXT,
        amount INTEGER
      )
    `);

    // Create index on timestamp for faster chronological queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_timestamp 
      ON subscriptions(timestamp)
    `);

    // Create index on channelId for faster channel-specific queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_channelId 
      ON subscriptions(channelId)
    `);
  }

  upsertViewer(id: string, username: string, displayName: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO viewers (id, username, displayName)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        displayName = excluded.displayName
    `);

    stmt.run(id, username, displayName);
  }

  getViewer(id: string): Viewer | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM viewers WHERE id = ?');
    return stmt.get(id) as Viewer | undefined || null;
  }

  getAllViewers(): Viewer[] {
    if (!this.db) return [];

    const stmt = this.db.prepare('SELECT * FROM viewers ORDER BY id ASC');
    return stmt.all() as Viewer[];
  }

  insertMessage(message: any): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, userId, channelId, message, timestamp, color, badges,
        isFirstMessage,
        isReturningChatter, isHighlighted, bits,
        replyParentMessageId, emoteOffsets
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO NOTHING
    `);

    stmt.run(
      message.id,
      message.userId,
      message.channelId,
      message.message,
      message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
      message.color || null,
      JSON.stringify(message.badges?.map((b: any) => b.imageUrl || b) || []),
      message.isFirstMessage ? 1 : 0,
      message.isReturningChatter ? 1 : 0,
      message.isHighlighted ? 1 : 0,
      message.bits || null,
      message.replyParentMessageId || null,
      message.emoteOffsets || null
    );
  }

  findRecentSelfMessage(userId: string, channelId: string, messageText: string, withinMs: number): { id: string } | null {
    if (!this.db) return null;

    const cutoffTime = new Date(Date.now() - withinMs).toISOString();
    
    const stmt = this.db.prepare(`
      SELECT id FROM messages
      WHERE userId = ?
        AND channelId = ?
        AND message = ?
        AND id LIKE 'self-%'
        AND timestamp > ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    return stmt.get(userId, channelId, messageText, cutoffTime) as { id: string } | undefined || null;
  }

  updateMessage(oldId: string, updates: any): void {
    if (!this.db) return;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.id !== undefined) {
      fields.push('id = ?');
      values.push(updates.id);
    }
    if (updates.timestamp !== undefined) {
      fields.push('timestamp = ?');
      values.push(updates.timestamp instanceof Date ? updates.timestamp.toISOString() : updates.timestamp);
    }
    if (updates.badges !== undefined) {
      fields.push('badges = ?');
      values.push(JSON.stringify(updates.badges));
    }
    if (updates.isMod !== undefined) {
      // Note: We'd need to add this column if it doesn't exist
      // For now, we'll skip fields that don't exist in the schema
    }
    if (updates.isFirstMessage !== undefined) {
      fields.push('isFirstMessage = ?');
      values.push(updates.isFirstMessage ? 1 : 0);
    }
    if (updates.isReturningChatter !== undefined) {
      fields.push('isReturningChatter = ?');
      values.push(updates.isReturningChatter ? 1 : 0);
    }
    if (updates.isHighlighted !== undefined) {
      fields.push('isHighlighted = ?');
      values.push(updates.isHighlighted ? 1 : 0);
    }
    if (updates.bits !== undefined) {
      fields.push('bits = ?');
      values.push(updates.bits || null);
    }
    if (updates.replyParentMessageId !== undefined) {
      fields.push('replyParentMessageId = ?');
      values.push(updates.replyParentMessageId || null);
    }
    if (updates.emoteOffsets !== undefined) {
      fields.push('emoteOffsets = ?');
      values.push(updates.emoteOffsets || null);
    }

    if (fields.length === 0) return;

    values.push(oldId);
    const sql = `UPDATE messages SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
  }

  getRecentMessages(channelId: string, limit: number = 100): DbChatMessage[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT 
        m.id,
        m.userId,
        m.channelId,
        v.username,
        v.displayName,
        m.message,
        m.timestamp,
        m.color,
        m.badges,
        m.isFirstMessage,
        m.isReturningChatter,
        m.isHighlighted,
        m.bits,
        m.replyParentMessageId,
        m.emoteOffsets,
        m.isDeleted
      FROM messages m
      INNER JOIN viewers v ON m.userId = v.id
      WHERE m.channelId = ?
      ORDER BY m.timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(channelId, limit) as any[];

    // Reverse to get chronological order (oldest first)
    return rows.reverse().map(row => ({
      id: row.id,
      userId: row.userId,
      channelId: row.channelId,
      username: row.username,
      displayName: row.displayName,
      message: row.message,
      timestamp: row.timestamp,
      color: row.color || undefined,
      badges: JSON.parse(row.badges || '[]'),
      isFirstMessage: row.isFirstMessage === 1,
      isReturningChatter: row.isReturningChatter === 1,
      isHighlighted: row.isHighlighted === 1,
      bits: row.bits || undefined,
      replyParentMessageId: row.replyParentMessageId || undefined,
      emoteOffsets: row.emoteOffsets || undefined,
      isDeleted: row.isDeleted === 1,
    }));
  }

  getMessagesByUserId(userId: string, channelId: string, limit: number = 100): DbChatMessage[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT 
        m.id,
        m.userId,
        m.channelId,
        v.username,
        v.displayName,
        m.message,
        m.timestamp,
        m.color,
        m.badges,
        m.isFirstMessage,
        m.isReturningChatter,
        m.isHighlighted,
        m.bits,
        m.replyParentMessageId,
        m.emoteOffsets,
        m.isDeleted
      FROM messages m
      INNER JOIN viewers v ON m.userId = v.id
      WHERE m.userId = ?
        AND m.channelId = ?
      ORDER BY m.timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(userId, channelId, limit) as any[];

    // Reverse to get chronological order (oldest first)
    return rows.reverse().map(row => ({
      id: row.id,
      userId: row.userId,
      channelId: row.channelId,
      username: row.username,
      displayName: row.displayName,
      message: row.message,
      timestamp: row.timestamp,
      color: row.color || undefined,
      badges: JSON.parse(row.badges || '[]'),
      isFirstMessage: row.isFirstMessage === 1,
      isReturningChatter: row.isReturningChatter === 1,
      isHighlighted: row.isHighlighted === 1,
      bits: row.bits || undefined,
      replyParentMessageId: row.replyParentMessageId || undefined,
      emoteOffsets: row.emoteOffsets || undefined,
      isDeleted: row.isDeleted === 1,
    }));
  }

  getMessageCountByUserId(userId: string, channelId: string): number {
    if (!this.db) return 0;

    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE userId = ?
        AND channelId = ?
    `);

    const result = stmt.get(userId, channelId) as { count: number } | undefined;
    return result?.count || 0;
  }

  markMessageAsDeleted(messageId: string): void {
    if (!this.db) return;

    const stmt = this.db.prepare('UPDATE messages SET isDeleted = 1 WHERE id = ?');
    stmt.run(messageId);
  }

  insertSubscription(subscription: any): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO subscriptions (
        id, type, userId, channelId, timestamp, tier,
        message, cumulativeMonths, streakMonths, durationMonths,
        isGift, gifterUserId, amount
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);

    stmt.run(
      subscription.id,
      subscription.type,
      subscription.userId,
      subscription.channelId,
      subscription.timestamp instanceof Date ? subscription.timestamp.toISOString() : subscription.timestamp,
      subscription.tier,
      subscription.message || null,
      subscription.cumulativeMonths || null,
      subscription.streakMonths || null,
      subscription.durationMonths || null,
      subscription.isGift ? 1 : 0,
      subscription.gifterUserId || null,
      subscription.amount || null
    );
  }

  getRecentSubscriptions(channelId: string, limit: number = 100): DbSubscriptionEvent[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT *
      FROM subscriptions
      WHERE channelId = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(channelId, limit) as any[];

    // Reverse to get chronological order (oldest first)
    return rows.reverse().map(row => ({
      id: row.id,
      type: row.type,
      userId: row.userId,
      channelId: row.channelId,
      timestamp: row.timestamp,
      tier: row.tier,
      message: row.message || undefined,
      cumulativeMonths: row.cumulativeMonths || undefined,
      streakMonths: row.streakMonths || undefined,
      durationMonths: row.durationMonths || undefined,
      isGift: row.isGift === 1,
      gifterUserId: row.gifterUserId || undefined,
      amount: row.amount || undefined,
    }));
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const databaseService = new DatabaseService();
