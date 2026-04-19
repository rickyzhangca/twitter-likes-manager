import { mkdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

import type {
  ArchiveSnapshot,
  ArchiveTweetPreview,
  DesktopAppState,
  SyncPhase,
  SyncRun,
  SyncRunStatus,
} from "../src/types/desktop"
import { parseLikesCaptureArtifact } from "./likes-import.ts"

type ArchiveStoreOptions = {
  dataDirectory: string
}

type TweetRow = {
  id: string
  url: string
  text: string
  liked_at: string
  created_at: string
  state: ArchiveTweetPreview["state"]
  like_count: number
  reply_count: number
  media_count: number
  author_id: string
  username: string
  display_name: string
  avatar_url: string | null
}

type SyncRunRow = {
  id: string
  status: SyncRunStatus
  phase: SyncPhase
  source: SyncRun["source"]
  started_at: string
  finished_at: string | null
  scanned_count: number
  imported_count: number
  message: string
}

const seededAuthors = [
  {
    id: "author-1",
    username: "localprototype",
    displayName: "Local Prototype",
    avatarUrl: null,
  },
  {
    id: "author-2",
    username: "archivenotes",
    displayName: "Archive Notes",
    avatarUrl: null,
  },
  {
    id: "author-3",
    username: "captureloop",
    displayName: "Capture Loop",
    avatarUrl: null,
  },
] as const

const seededTweets = [
  {
    id: "tweet-1",
    authorId: "author-1",
    url: "https://x.com/localprototype/status/1000000000000000001",
    text: "First seeded like in the local archive. This row proves the renderer is reading from app-owned storage instead of a hardcoded screen.",
    likedAt: "2026-04-18T14:23:00.000Z",
    createdAt: "2026-04-18T13:58:00.000Z",
    state: "available",
    likeCount: 42,
    replyCount: 4,
  },
  {
    id: "tweet-2",
    authorId: "author-2",
    url: "https://x.com/archivenotes/status/1000000000000000002",
    text: "Storage comes before capture. Once the DB contract is stable, the Playwright worker only has to normalize into it.",
    likedAt: "2026-04-17T09:10:00.000Z",
    createdAt: "2026-04-17T08:41:00.000Z",
    state: "available",
    likeCount: 18,
    replyCount: 2,
  },
  {
    id: "tweet-3",
    authorId: "author-3",
    url: "https://x.com/captureloop/status/1000000000000000003",
    text: "The next slice can replace this seeded row with real liked tweets captured from the signed-in web client.",
    likedAt: "2026-04-16T22:05:00.000Z",
    createdAt: "2026-04-16T21:48:00.000Z",
    state: "planned",
    likeCount: 7,
    replyCount: 1,
  },
] as const

const seededMedia = [
  {
    id: "media-1",
    tweetId: "tweet-1",
    kind: "photo",
    remoteUrl: "https://example.com/media/seeded-like-1.jpg",
    localPath: null,
  },
  {
    id: "media-2",
    tweetId: "tweet-3",
    kind: "photo",
    remoteUrl: "https://example.com/media/seeded-like-2.jpg",
    localPath: null,
  },
] as const

export class ArchiveStore {
  readonly dataDirectory: string
  readonly databasePath: string
  readonly mediaDirectory: string

  private readonly database: DatabaseSync

  constructor({ dataDirectory }: ArchiveStoreOptions) {
    this.dataDirectory = dataDirectory
    this.databasePath = path.join(this.dataDirectory, "archive.db")
    this.mediaDirectory = path.join(this.dataDirectory, "media")

    mkdirSync(this.dataDirectory, { recursive: true })
    mkdirSync(this.mediaDirectory, { recursive: true })

    this.database = new DatabaseSync(this.databasePath)
    this.database.exec("PRAGMA journal_mode = WAL")
    this.database.exec("PRAGMA foreign_keys = ON")

    this.ensureSchema()
    this.seedIfEmpty()
  }

  getAppState(): Pick<DesktopAppState, "dataDirectory" | "services"> {
    return {
      dataDirectory: this.dataDirectory,
      services: [
        {
          id: "electron-shell",
          label: "Electron shell",
          status: "ready",
          detail:
            "Desktop window, preload bridge, and runtime metadata are active.",
        },
        {
          id: "storage-layer",
          label: "Local storage",
          status: "ready",
          detail: `Archive database ready at ${this.databasePath}.`,
        },
        {
          id: "capture-worker",
          label: "Capture worker",
          status: "ready",
          detail:
            "A Playwright profile can capture Likes responses and normalize them into the local archive.",
        },
      ],
    }
  }

  importLikesCapture(artifactPath: string) {
    const parsedCapture = parseLikesCaptureArtifact(artifactPath)

    if (parsedCapture.tweets.length === 0) {
      return {
        scannedCount: 0,
        importedCount: 0,
        likesResponseCount: parsedCapture.likesResponseCount,
      }
    }

    const upsertAuthor = this.database.prepare(
      `
        INSERT INTO authors (id, username, display_name, avatar_url)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          username = excluded.username,
          display_name = excluded.display_name,
          avatar_url = excluded.avatar_url
      `,
    )
    const upsertTweet = this.database.prepare(
      `
        INSERT INTO tweets (
          id,
          author_id,
          url,
          text,
          liked_at,
          created_at,
          state,
          like_count,
          reply_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          author_id = excluded.author_id,
          url = excluded.url,
          text = excluded.text,
          liked_at = excluded.liked_at,
          created_at = excluded.created_at,
          state = excluded.state,
          like_count = excluded.like_count,
          reply_count = excluded.reply_count
      `,
    )
    const deleteMediaForTweet = this.database.prepare(
      `
        DELETE FROM media
        WHERE tweet_id = ?
      `,
    )
    const insertMedia = this.database.prepare(
      `
        INSERT INTO media (id, tweet_id, kind, remote_url, local_path)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          tweet_id = excluded.tweet_id,
          kind = excluded.kind,
          remote_url = excluded.remote_url,
          local_path = excluded.local_path
      `,
    )

    this.database.exec("BEGIN")

    try {
      this.removeSeedData()

      for (const tweet of parsedCapture.tweets) {
        upsertAuthor.run(
          tweet.authorId,
          tweet.username,
          tweet.displayName,
          tweet.avatarUrl,
        )

        upsertTweet.run(
          tweet.id,
          tweet.authorId,
          tweet.url,
          tweet.text,
          tweet.likedAt,
          tweet.createdAt,
          tweet.state,
          tweet.likeCount,
          tweet.replyCount,
        )

        deleteMediaForTweet.run(tweet.id)

        for (const media of tweet.media) {
          insertMedia.run(media.id, tweet.id, media.kind, media.remoteUrl, null)
        }
      }

      this.database.exec("COMMIT")
    } catch (error) {
      this.database.exec("ROLLBACK")
      throw error
    }

    return {
      scannedCount: parsedCapture.tweets.length,
      importedCount: parsedCapture.tweets.length,
      likesResponseCount: parsedCapture.likesResponseCount,
    }
  }

  getArchiveSnapshot(): ArchiveSnapshot {
    const stats = this.database
      .prepare(
        `
          SELECT
            (SELECT COUNT(*) FROM tweets) AS tweet_count,
            (SELECT COUNT(*) FROM authors) AS author_count,
            (SELECT COUNT(*) FROM media) AS media_count,
            (SELECT MAX(liked_at) FROM tweets) AS latest_liked_at
        `
      )
      .get() as {
      tweet_count: number
      author_count: number
      media_count: number
      latest_liked_at: string | null
    }

    const tweetRows = this.database
      .prepare(
        `
          SELECT
            tweets.id,
            tweets.url,
            tweets.text,
            tweets.liked_at,
            tweets.created_at,
            tweets.state,
            tweets.like_count,
            tweets.reply_count,
            COUNT(media.id) AS media_count,
            authors.id AS author_id,
            authors.username,
            authors.display_name,
            authors.avatar_url
          FROM tweets
          JOIN authors ON authors.id = tweets.author_id
          LEFT JOIN media ON media.tweet_id = tweets.id
          GROUP BY tweets.id
          ORDER BY tweets.liked_at DESC
          LIMIT 12
        `
      )
      .all() as TweetRow[]

    const mediaStatement = this.database.prepare(
      `
        SELECT id, tweet_id, kind, remote_url, local_path
        FROM media
        WHERE tweet_id = ?
        ORDER BY id ASC
      `
    )

    return {
      databasePath: this.databasePath,
      dataDirectory: this.dataDirectory,
      stats: {
        tweetCount: stats.tweet_count,
        authorCount: stats.author_count,
        mediaCount: stats.media_count,
        latestLikedAt: stats.latest_liked_at,
      },
      tweets: tweetRows.map((tweet) => ({
        id: tweet.id,
        url: tweet.url,
        text: tweet.text,
        likedAt: tweet.liked_at,
        createdAt: tweet.created_at,
        state: tweet.state,
        metrics: {
          likes: tweet.like_count,
          replies: tweet.reply_count,
          mediaCount: tweet.media_count,
        },
        author: {
          id: tweet.author_id,
          username: tweet.username,
          displayName: tweet.display_name,
          avatarUrl: tweet.avatar_url,
        },
        media: (mediaStatement.all(tweet.id) as Array<{
          id: string
          tweet_id: string
          kind: ArchiveTweetPreview["media"][number]["kind"]
          remote_url: string
          local_path: string | null
        }>).map((media) => ({
          id: media.id,
          kind: media.kind,
          remoteUrl: media.remote_url,
          localPath: media.local_path,
        })),
      })),
    }
  }

  listSyncRuns(limit = 8): SyncRun[] {
    const rows = this.database
      .prepare(
        `
          SELECT
            id,
            status,
            phase,
            source,
            started_at,
            finished_at,
            scanned_count,
            imported_count,
            message
          FROM sync_runs
          ORDER BY started_at DESC
          LIMIT ?
        `
      )
      .all(limit) as SyncRunRow[]

    return rows.map((row) => this.mapSyncRun(row))
  }

  getSyncRun(id: string): SyncRun | null {
    const row = this.database
      .prepare(
        `
          SELECT
            id,
            status,
            phase,
            source,
            started_at,
            finished_at,
            scanned_count,
            imported_count,
            message
          FROM sync_runs
          WHERE id = ?
        `
      )
      .get(id) as SyncRunRow | undefined

    return row ? this.mapSyncRun(row) : null
  }

  createSyncRun(run: SyncRun): SyncRun {
    this.database
      .prepare(
        `
          INSERT INTO sync_runs (
            id,
            status,
            phase,
            source,
            started_at,
            finished_at,
            scanned_count,
            imported_count,
            message
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        run.id,
        run.status,
        run.phase,
        run.source,
        run.startedAt,
        run.finishedAt,
        run.scannedCount,
        run.importedCount,
        run.message
      )

    return this.getSyncRun(run.id) ?? run
  }

  updateSyncRun(
    id: string,
    updates: {
      status?: SyncRunStatus
      phase?: SyncPhase
      finishedAt?: string | null
      scannedCount?: number
      importedCount?: number
      message?: string
    }
  ): SyncRun {
    const currentRun = this.getSyncRun(id)

    if (!currentRun) {
      throw new Error(`Sync run ${id} does not exist`)
    }

    this.database
      .prepare(
        `
          UPDATE sync_runs
          SET
            status = ?,
            phase = ?,
            finished_at = ?,
            scanned_count = ?,
            imported_count = ?,
            message = ?
          WHERE id = ?
        `
      )
      .run(
        updates.status ?? currentRun.status,
        updates.phase ?? currentRun.phase,
        updates.finishedAt === undefined
          ? currentRun.finishedAt
          : updates.finishedAt,
        updates.scannedCount ?? currentRun.scannedCount,
        updates.importedCount ?? currentRun.importedCount,
        updates.message ?? currentRun.message,
        id
      )

    const nextRun = this.getSyncRun(id)

    if (!nextRun) {
      throw new Error(`Sync run ${id} disappeared after update`)
    }

    return nextRun
  }

  private ensureSchema() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        phase TEXT NOT NULL,
        source TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        scanned_count INTEGER NOT NULL DEFAULT 0,
        imported_count INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS authors (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS tweets (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        text TEXT NOT NULL,
        liked_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        state TEXT NOT NULL,
        like_count INTEGER NOT NULL DEFAULT 0,
        reply_count INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        tweet_id TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        remote_url TEXT NOT NULL,
        local_path TEXT
      ) STRICT;
    `)
  }

  private seedIfEmpty() {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM tweets")
      .get() as { count: number }

    if (row.count > 0) {
      return
    }

    const insertAuthor = this.database.prepare(
      `
        INSERT INTO authors (id, username, display_name, avatar_url)
        VALUES (?, ?, ?, ?)
      `
    )
    const insertTweet = this.database.prepare(
      `
        INSERT INTO tweets (
          id,
          author_id,
          url,
          text,
          liked_at,
          created_at,
          state,
          like_count,
          reply_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    const insertMedia = this.database.prepare(
      `
        INSERT INTO media (id, tweet_id, kind, remote_url, local_path)
        VALUES (?, ?, ?, ?, ?)
      `
    )

    this.database.exec("BEGIN")

    try {
      for (const author of seededAuthors) {
        insertAuthor.run(
          author.id,
          author.username,
          author.displayName,
          author.avatarUrl
        )
      }

      for (const tweet of seededTweets) {
        insertTweet.run(
          tweet.id,
          tweet.authorId,
          tweet.url,
          tweet.text,
          tweet.likedAt,
          tweet.createdAt,
          tweet.state,
          tweet.likeCount,
          tweet.replyCount
        )
      }

      for (const media of seededMedia) {
        insertMedia.run(
          media.id,
          media.tweetId,
          media.kind,
          media.remoteUrl,
          media.localPath
        )
      }

      this.database.exec("COMMIT")
    } catch (error) {
      this.database.exec("ROLLBACK")
      throw error
    }
  }

  private removeSeedData() {
    this.database.exec(`
      DELETE FROM media WHERE id LIKE 'media-%';
      DELETE FROM tweets WHERE id LIKE 'tweet-%';
      DELETE FROM authors WHERE id LIKE 'author-%';
    `)
  }

  private mapSyncRun(row: SyncRunRow): SyncRun {
    return {
      id: row.id,
      status: row.status,
      phase: row.phase,
      source: row.source,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      scannedCount: row.scanned_count,
      importedCount: row.imported_count,
      message: row.message,
    }
  }
}