import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface Viewer {
  id: string;
  username: string;
  displayName: string;
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

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const databaseService = new DatabaseService();
