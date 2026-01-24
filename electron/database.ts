import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface Viewer {
  id: string;
  username: string;
  displayName: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  message: string;
  timestamp: string;
  color?: string;
  badges: string;
  isFirstMessage: boolean;
  isReturningChatter: boolean;
  isHighlighted: boolean;
  isCheer: boolean;
  bits?: number;
  isReply: boolean;
  replyParentMessageId?: string;
  emoteOffsets?: string;
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
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        color TEXT,
        badges TEXT NOT NULL,
        isFirstMessage INTEGER NOT NULL DEFAULT 0,
        isReturningChatter INTEGER NOT NULL DEFAULT 0,
        isHighlighted INTEGER NOT NULL DEFAULT 0,
        isCheer INTEGER NOT NULL DEFAULT 0,
        bits INTEGER,
        isReply INTEGER NOT NULL DEFAULT 0,
        replyParentMessageId TEXT,
        emoteOffsets TEXT
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
        id, userId, message, timestamp, color, badges,
        isFirstMessage,
        isReturningChatter, isHighlighted, isCheer, bits, isReply,
        replyParentMessageId, emoteOffsets
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO NOTHING
    `);

    stmt.run(
      message.id,
      message.userId,
      message.message,
      message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
      message.color || null,
      JSON.stringify(message.badges?.map((b: any) => b.imageUrl || b) || []),
      message.isFirstMessage ? 1 : 0,
      message.isReturningChatter ? 1 : 0,
      message.isHighlighted ? 1 : 0,
      message.isCheer ? 1 : 0,
      message.bits || null,
      message.isReply ? 1 : 0,
      message.replyParentMessageId || null,
      message.emoteOffsets || null
    );
  }

  findRecentSelfMessage(userId: string, messageText: string, withinMs: number): { id: string } | null {
    if (!this.db) return null;

    const cutoffTime = new Date(Date.now() - withinMs).toISOString();
    
    const stmt = this.db.prepare(`
      SELECT id FROM messages
      WHERE userId = ?
        AND message = ?
        AND id LIKE 'self-%'
        AND timestamp > ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    return stmt.get(userId, messageText, cutoffTime) as { id: string } | undefined || null;
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
    if (updates.isCheer !== undefined) {
      fields.push('isCheer = ?');
      values.push(updates.isCheer ? 1 : 0);
    }
    if (updates.bits !== undefined) {
      fields.push('bits = ?');
      values.push(updates.bits || null);
    }
    if (updates.isReply !== undefined) {
      fields.push('isReply = ?');
      values.push(updates.isReply ? 1 : 0);
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

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const databaseService = new DatabaseService();
