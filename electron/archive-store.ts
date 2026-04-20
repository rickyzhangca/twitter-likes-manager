import { mkdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

import type {
  ArchiveMedia,
  ArchiveQueryOptions,
  ArchiveSnapshot,
  ArchiveTweetPreview,
  DesktopAppState,
  SyncDownloadProgress,
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
  imported_at: string
  created_at: string
  state: ArchiveTweetPreview["state"]
  like_count: number
  reply_count: number
  media_count: number
  source: "like" | "quoted"
  quoted_tweet_id: string | null
  author_id: string
  username: string
  display_name: string
  avatar_url: string | null
  qt_id: string | null
  qt_url: string | null
  qt_text: string | null
  qt_created_at: string | null
  qt_state: string | null
  qt_like_count: number | null
  qt_reply_count: number | null
  qt_author_id: string | null
  qt_username: string | null
  qt_display_name: string | null
  qt_avatar_url: string | null
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
  resumable_from_phase: SyncPhase | null
  failed_media_count: number
  retryable_media_count: number
  pending_media_count: number
  completed_media_count: number
  total_media_count: number
}

type SyncCheckpointRow = {
  run_id: string
  max_tweets: number
  capture_artifact_path: string | null
  capture_completed_at: string | null
  import_completed_at: string | null
  download_completed_at: string | null
  resumable_from_phase: SyncPhase | null
  updated_at: string
}

type SyncCheckpoint = {
  runId: string
  maxTweets: number
  captureArtifactPath: string | null
  captureCompletedAt: string | null
  importCompletedAt: string | null
  downloadCompletedAt: string | null
  resumableFromPhase: SyncPhase | null
  updatedAt: string
}

type MediaDownloadRow = {
  id: string
  kind: ArchiveMedia["kind"]
  remote_url: string
}

type MediaDownloadJobStatus = "pending" | "downloading" | "downloaded" | "failed"

type MediaDownloadJobRow = {
  run_id: string
  media_id: string
  kind: ArchiveMedia["kind"]
  remote_url: string
  status: MediaDownloadJobStatus
  attempt_count: number
  last_error: string | null
  last_attempted_at: string | null
  downloaded_at: string | null
}

type MediaDownloadJob = {
  runId: string
  mediaId: string
  kind: ArchiveMedia["kind"]
  remoteUrl: string
  status: MediaDownloadJobStatus
  attemptCount: number
  lastError: string | null
  lastAttemptedAt: string | null
  downloadedAt: string | null
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
    importedAt: "2026-04-18T14:23:00.000Z",
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
    importedAt: "2026-04-17T09:10:00.000Z",
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
    importedAt: "2026-04-16T22:05:00.000Z",
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
    this.migrateSchema()
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
        },
        {
          id: "storage-layer",
          label: "Local storage",
          status: "ready",
        },
        {
          id: "capture-worker",
          label: "Capture worker",
          status: "ready",
        },
      ],
    }
  }

  importLikesCapture(artifactPath: string, maxTweets?: number) {
    const parsedCapture = parseLikesCaptureArtifact(artifactPath, maxTweets)

    if (parsedCapture.tweets.length === 0) {
      return {
        scannedCount: 0,
        importedCount: 0,
        mediaCount: 0,
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
          imported_at,
          created_at,
          state,
          like_count,
          reply_count,
          source,
          quoted_tweet_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          author_id = excluded.author_id,
          url = excluded.url,
          text = excluded.text,
          imported_at = excluded.imported_at,
          created_at = excluded.created_at,
          state = excluded.state,
          like_count = excluded.like_count,
          reply_count = excluded.reply_count,
          source = CASE
            WHEN tweets.source = 'like' THEN tweets.source
            ELSE excluded.source
          END,
          quoted_tweet_id = COALESCE(excluded.quoted_tweet_id, tweets.quoted_tweet_id)
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

        const source = parsedCapture.sources.get(tweet.id) ?? "like"
        const quotedTweetId = tweet.quotedTweet
          ? tweet.quotedTweet.id
          : (parsedCapture.quotedTweetIds.get(tweet.id) ?? null)

        upsertTweet.run(
          tweet.id,
          tweet.authorId,
          tweet.url,
          tweet.text,
          tweet.importedAt,
          tweet.createdAt,
          tweet.state,
          tweet.likeCount,
          tweet.replyCount,
          source,
          quotedTweetId,
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

    const mediaCount = parsedCapture.tweets.reduce(
      (count, tweet) => count + tweet.media.length,
      0,
    )

    const likedCount = parsedCapture.tweets.filter(
      (t) => parsedCapture.sources.get(t.id) === "like",
    ).length

    return {
      scannedCount: likedCount,
      importedCount: parsedCapture.tweets.length,
      mediaCount,
      likesResponseCount: parsedCapture.likesResponseCount,
    }
  }

  getArchiveSnapshot(options?: ArchiveQueryOptions): ArchiveSnapshot {
    const limit = normalizeArchiveLimit(options?.limit)
    const searchTerm = normalizeArchiveSearch(options?.search)
    const escapedSearchTerm = searchTerm
      ? `%${escapeSqlLikePattern(searchTerm)}%`
      : null

    const stats = this.database
      .prepare(
        `
          SELECT
            (SELECT COUNT(*) FROM tweets WHERE source = 'like') AS tweet_count,
            (SELECT COUNT(*) FROM authors) AS author_count,
            (SELECT COUNT(*) FROM media) AS media_count,
            (SELECT MAX(imported_at) FROM tweets WHERE source = 'like') AS latest_imported_at
        `
      )
      .get() as {
      tweet_count: number
      author_count: number
      media_count: number
      latest_imported_at: string | null
    }

    const tweetRows = this.database
      .prepare(
        `
          SELECT
            tweets.id,
            tweets.url,
            tweets.text,
            tweets.imported_at,
            tweets.created_at,
            tweets.state,
            tweets.like_count,
            tweets.reply_count,
            tweets.quoted_tweet_id,
            COUNT(media.id) AS media_count,
            authors.id AS author_id,
            authors.username,
            authors.display_name,
            authors.avatar_url,
            qt.id AS qt_id,
            qt.url AS qt_url,
            qt.text AS qt_text,
            qt.created_at AS qt_created_at,
            qt.state AS qt_state,
            qt.like_count AS qt_like_count,
            qt.reply_count AS qt_reply_count,
            qta.id AS qt_author_id,
            qta.username AS qt_username,
            qta.display_name AS qt_display_name,
            qta.avatar_url AS qt_avatar_url
          FROM tweets
          JOIN authors ON authors.id = tweets.author_id
          LEFT JOIN tweets qt ON qt.id = tweets.quoted_tweet_id
          LEFT JOIN authors qta ON qta.id = qt.author_id
          LEFT JOIN media ON media.tweet_id = tweets.id
          WHERE tweets.source = 'like'
            ${
              escapedSearchTerm
                ? `AND (
                    lower(tweets.text) LIKE ? ESCAPE '\\'
                    OR lower(authors.username) LIKE ? ESCAPE '\\'
                    OR lower(authors.display_name) LIKE ? ESCAPE '\\'
                  )`
                : ""
            }
          GROUP BY tweets.id
          ORDER BY tweets.imported_at DESC
            LIMIT ?
        `
      )
        .all(
          ...(escapedSearchTerm
            ? [escapedSearchTerm, escapedSearchTerm, escapedSearchTerm]
            : []),
          limit,
        ) as TweetRow[]

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
        latestImportedAt: stats.latest_imported_at,
      },
      tweets: tweetRows.map((tweet) => ({
        id: tweet.id,
        url: tweet.url,
        text: tweet.text,
        importedAt: tweet.imported_at,
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
        quotedTweet: tweet.qt_id
          ? {
              id: tweet.qt_id,
              url: tweet.qt_url ?? "",
              text: tweet.qt_text ?? "",
              importedAt: tweet.imported_at,
              createdAt: tweet.qt_created_at ?? tweet.imported_at,
              state: (tweet.qt_state as ArchiveTweetPreview["state"]) ?? "available",
              metrics: {
                likes: tweet.qt_like_count ?? 0,
                replies: tweet.qt_reply_count ?? 0,
                mediaCount: (mediaStatement.all(tweet.qt_id) as Array<{ id: string }>).length,
              },
              author: {
                id: tweet.qt_author_id ?? "",
                username: tweet.qt_username ?? "",
                displayName: tweet.qt_display_name ?? "",
                avatarUrl: tweet.qt_avatar_url,
              },
              media: (mediaStatement.all(tweet.qt_id!) as Array<{
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
              quotedTweet: null,
            }
          : null,
      })),
    }
  }

  listMediaPendingDownload(limit = 250): Array<{
    id: string
    kind: ArchiveMedia["kind"]
    remoteUrl: string
  }> {
    const rows = this.database
      .prepare(
        `
          SELECT media.id, media.kind, media.remote_url
          FROM media
          JOIN tweets ON tweets.id = media.tweet_id
          WHERE media.local_path IS NULL
          ORDER BY tweets.imported_at DESC, media.id ASC
          LIMIT ?
        `
      )
      .all(limit) as MediaDownloadRow[]

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      remoteUrl: row.remote_url,
    }))
  }

  updateMediaLocalPath(id: string, localPath: string) {
    this.database
      .prepare(
        `
          UPDATE media
          SET local_path = ?
          WHERE id = ?
        `
      )
      .run(localPath, id)
  }

  listSyncRuns(limit = 8): SyncRun[] {
    const rows = this.database
      .prepare(
        `
          SELECT
            ${syncRunSelectColumns}
          FROM sync_runs
          LEFT JOIN sync_run_checkpoints
            ON sync_run_checkpoints.run_id = sync_runs.id
          LEFT JOIN media_download_job_stats
            ON media_download_job_stats.run_id = sync_runs.id
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
            ${syncRunSelectColumns}
          FROM sync_runs
          LEFT JOIN sync_run_checkpoints
            ON sync_run_checkpoints.run_id = sync_runs.id
          LEFT JOIN media_download_job_stats
            ON media_download_job_stats.run_id = sync_runs.id
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

  createSyncCheckpoint(runId: string, maxTweets: number) {
    const now = new Date().toISOString()

    this.database
      .prepare(
        `
          INSERT INTO sync_run_checkpoints (
            run_id,
            max_tweets,
            capture_artifact_path,
            capture_completed_at,
            import_completed_at,
            download_completed_at,
            resumable_from_phase,
            updated_at
          ) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, ?)
          ON CONFLICT(run_id) DO UPDATE SET
            max_tweets = excluded.max_tweets,
            updated_at = excluded.updated_at
        `
      )
      .run(runId, maxTweets, now)

    return this.getSyncCheckpoint(runId)
  }

  getSyncCheckpoint(runId: string): SyncCheckpoint | null {
    const row = this.database
      .prepare(
        `
          SELECT
            run_id,
            max_tweets,
            capture_artifact_path,
            capture_completed_at,
            import_completed_at,
            download_completed_at,
            resumable_from_phase,
            updated_at
          FROM sync_run_checkpoints
          WHERE run_id = ?
        `
      )
      .get(runId) as SyncCheckpointRow | undefined

    return row ? this.mapSyncCheckpoint(row) : null
  }

  updateSyncCheckpoint(
    runId: string,
    updates: {
      maxTweets?: number
      captureArtifactPath?: string | null
      captureCompletedAt?: string | null
      importCompletedAt?: string | null
      downloadCompletedAt?: string | null
      resumableFromPhase?: SyncPhase | null
    }
  ) {
    const currentCheckpoint = this.getSyncCheckpoint(runId)

    if (!currentCheckpoint) {
      throw new Error(`Sync checkpoint for run ${runId} does not exist`)
    }

    const updatedAt = new Date().toISOString()

    this.database
      .prepare(
        `
          UPDATE sync_run_checkpoints
          SET
            max_tweets = ?,
            capture_artifact_path = ?,
            capture_completed_at = ?,
            import_completed_at = ?,
            download_completed_at = ?,
            resumable_from_phase = ?,
            updated_at = ?
          WHERE run_id = ?
        `
      )
      .run(
        updates.maxTweets ?? currentCheckpoint.maxTweets,
        updates.captureArtifactPath === undefined
          ? currentCheckpoint.captureArtifactPath
          : updates.captureArtifactPath,
        updates.captureCompletedAt === undefined
          ? currentCheckpoint.captureCompletedAt
          : updates.captureCompletedAt,
        updates.importCompletedAt === undefined
          ? currentCheckpoint.importCompletedAt
          : updates.importCompletedAt,
        updates.downloadCompletedAt === undefined
          ? currentCheckpoint.downloadCompletedAt
          : updates.downloadCompletedAt,
        updates.resumableFromPhase === undefined
          ? currentCheckpoint.resumableFromPhase
          : updates.resumableFromPhase,
        updatedAt,
        runId
      )

    return this.getSyncCheckpoint(runId)
  }

  getLatestResumableRun(): SyncRun | null {
    const row = this.database
      .prepare(
        `
          SELECT
            ${syncRunSelectColumns}
          FROM sync_runs
          LEFT JOIN sync_run_checkpoints
            ON sync_run_checkpoints.run_id = sync_runs.id
          LEFT JOIN media_download_job_stats
            ON media_download_job_stats.run_id = sync_runs.id
          WHERE sync_run_checkpoints.resumable_from_phase IS NOT NULL
          ORDER BY sync_runs.started_at DESC
          LIMIT 1
        `
      )
      .get() as SyncRunRow | undefined

    return row ? this.mapSyncRun(row) : null
  }

  createOrRefreshMediaDownloadJobs(
    runId: string,
    items: Array<{
      id: string
      kind: ArchiveMedia["kind"]
      remoteUrl: string
    }>
  ) {
    const statement = this.database.prepare(
      `
        INSERT INTO media_download_jobs (
          run_id,
          media_id,
          kind,
          remote_url,
          status,
          attempt_count,
          last_error,
          last_attempted_at,
          downloaded_at
        ) VALUES (?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL)
        ON CONFLICT(run_id, media_id) DO UPDATE SET
          kind = excluded.kind,
          remote_url = excluded.remote_url,
          status = CASE
            WHEN media_download_jobs.status = 'downloaded' THEN media_download_jobs.status
            ELSE 'pending'
          END,
          last_error = CASE
            WHEN media_download_jobs.status = 'downloaded' THEN media_download_jobs.last_error
            ELSE NULL
          END,
          last_attempted_at = CASE
            WHEN media_download_jobs.status = 'downloaded' THEN media_download_jobs.last_attempted_at
            ELSE NULL
          END,
          downloaded_at = CASE
            WHEN media_download_jobs.status = 'downloaded' THEN media_download_jobs.downloaded_at
            ELSE NULL
          END
      `
    )

    this.database.exec("BEGIN")

    try {
      for (const item of items) {
        statement.run(runId, item.id, item.kind, item.remoteUrl)
      }

      this.database.exec("COMMIT")
    } catch (error) {
      this.database.exec("ROLLBACK")
      throw error
    }
  }

  listMediaDownloadJobs(
    runId: string,
    statuses?: MediaDownloadJobStatus[]
  ): MediaDownloadJob[] {
    const filters = statuses ?? []
    const rows = this.database
      .prepare(
        `
          SELECT
            run_id,
            media_id,
            kind,
            remote_url,
            status,
            attempt_count,
            last_error,
            last_attempted_at,
            downloaded_at
          FROM media_download_jobs
          WHERE run_id = ?
            ${
              filters.length > 0
                ? `AND status IN (${filters.map(() => "?").join(", ")})`
                : ""
            }
          ORDER BY media_id ASC
        `
      )
      .all(runId, ...filters) as MediaDownloadJobRow[]

    return rows.map((row) => this.mapMediaDownloadJob(row))
  }

  markMediaDownloadStarted(runId: string, mediaId: string) {
    const lastAttemptedAt = new Date().toISOString()

    this.database
      .prepare(
        `
          UPDATE media_download_jobs
          SET
            status = 'downloading',
            attempt_count = attempt_count + 1,
            last_attempted_at = ?
          WHERE run_id = ?
            AND media_id = ?
        `
      )
      .run(lastAttemptedAt, runId, mediaId)
  }

  markMediaDownloadFailed(runId: string, mediaId: string, lastError: string) {
    const lastAttemptedAt = new Date().toISOString()

    this.database
      .prepare(
        `
          UPDATE media_download_jobs
          SET
            status = 'failed',
            last_error = ?,
            last_attempted_at = ?
          WHERE run_id = ?
            AND media_id = ?
        `
      )
      .run(lastError, lastAttemptedAt, runId, mediaId)
  }

  markMediaDownloaded(runId: string, mediaId: string, localPath: string) {
    const completedAt = new Date().toISOString()

    this.database.exec("BEGIN")

    try {
      this.database
        .prepare(
          `
            UPDATE media_download_jobs
            SET
              status = 'downloaded',
              last_error = NULL,
              downloaded_at = ?,
              last_attempted_at = COALESCE(last_attempted_at, ?)
            WHERE run_id = ?
              AND media_id = ?
          `
        )
        .run(completedAt, completedAt, runId, mediaId)

      this.database
        .prepare(
          `
            UPDATE media
            SET local_path = ?
            WHERE id = ?
          `
        )
        .run(localPath, mediaId)

      this.database.exec("COMMIT")
    } catch (error) {
      this.database.exec("ROLLBACK")
      throw error
    }
  }

  summarizeMediaDownloadJobs(runId: string): SyncDownloadProgress | null {
    const row = this.database
      .prepare(
        `
          SELECT
            COUNT(*) AS total_media_count,
            SUM(CASE WHEN status = 'downloaded' THEN 1 ELSE 0 END) AS completed_media_count,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_media_count,
            SUM(CASE WHEN status IN ('pending', 'downloading') THEN 1 ELSE 0 END) AS pending_media_count
          FROM media_download_jobs
          WHERE run_id = ?
        `
      )
      .get(runId) as {
      total_media_count: number
      completed_media_count: number | null
      failed_media_count: number | null
      pending_media_count: number | null
    }

    if (!row || row.total_media_count === 0) {
      return null
    }

    return {
      completedCount: row.completed_media_count ?? 0,
      failedCount: row.failed_media_count ?? 0,
      pendingCount: row.pending_media_count ?? 0,
      totalCount: row.total_media_count,
    }
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

  private migrateSchema() {
    const columns = this.database
      .prepare("PRAGMA table_info(tweets)")
      .all() as Array<{ name: string }>

    if (columns.some((col) => col.name === "liked_at")) {
      this.database.exec(
        "ALTER TABLE tweets RENAME COLUMN liked_at TO imported_at"
      )
    }

    const columnNames = new Set(columns.map((col) => col.name))

    if (!columnNames.has("source")) {
      this.database.exec(
        "ALTER TABLE tweets ADD COLUMN source TEXT NOT NULL DEFAULT 'like'"
      )
    }

    if (!columnNames.has("quoted_tweet_id")) {
      this.database.exec(
        "ALTER TABLE tweets ADD COLUMN quoted_tweet_id TEXT"
      )
    }
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
        imported_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        state TEXT NOT NULL,
        like_count INTEGER NOT NULL DEFAULT 0,
        reply_count INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'like',
        quoted_tweet_id TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        tweet_id TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        remote_url TEXT NOT NULL,
        local_path TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS sync_run_checkpoints (
        run_id TEXT PRIMARY KEY REFERENCES sync_runs(id) ON DELETE CASCADE,
        max_tweets INTEGER NOT NULL DEFAULT 200,
        capture_artifact_path TEXT,
        capture_completed_at TEXT,
        import_completed_at TEXT,
        download_completed_at TEXT,
        resumable_from_phase TEXT,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS media_download_jobs (
        run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
        media_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        remote_url TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        last_attempted_at TEXT,
        downloaded_at TEXT,
        PRIMARY KEY (run_id, media_id)
      ) STRICT;

      CREATE VIEW IF NOT EXISTS media_download_job_stats AS
      SELECT
        run_id,
        COUNT(*) AS total_media_count,
        SUM(CASE WHEN status = 'downloaded' THEN 1 ELSE 0 END) AS completed_media_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_media_count,
        SUM(CASE WHEN status IN ('pending', 'downloading') THEN 1 ELSE 0 END) AS pending_media_count,
        SUM(CASE WHEN status != 'downloaded' THEN 1 ELSE 0 END) AS retryable_media_count
      FROM media_download_jobs
      GROUP BY run_id;

      CREATE INDEX IF NOT EXISTS idx_sync_run_checkpoints_resumable_phase
      ON sync_run_checkpoints (resumable_from_phase, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_media_download_jobs_run_status
      ON media_download_jobs (run_id, status);
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
          imported_at,
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
          tweet.importedAt,
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
    const totalCount = row.total_media_count ?? 0

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
      hasResumableCheckpoint: Boolean(row.resumable_from_phase),
      resumableFromPhase: row.resumable_from_phase,
      failedMediaCount: row.failed_media_count ?? 0,
      retryableMediaCount: row.retryable_media_count ?? 0,
      downloadProgress:
        totalCount > 0
          ? {
              completedCount: row.completed_media_count ?? 0,
              failedCount: row.failed_media_count ?? 0,
              pendingCount: row.pending_media_count ?? 0,
              totalCount,
            }
          : null,
    }
  }

  private mapSyncCheckpoint(row: SyncCheckpointRow): SyncCheckpoint {
    return {
      runId: row.run_id,
      maxTweets: row.max_tweets,
      captureArtifactPath: row.capture_artifact_path,
      captureCompletedAt: row.capture_completed_at,
      importCompletedAt: row.import_completed_at,
      downloadCompletedAt: row.download_completed_at,
      resumableFromPhase: row.resumable_from_phase,
      updatedAt: row.updated_at,
    }
  }

  private mapMediaDownloadJob(row: MediaDownloadJobRow): MediaDownloadJob {
    return {
      runId: row.run_id,
      mediaId: row.media_id,
      kind: row.kind,
      remoteUrl: row.remote_url,
      status: row.status,
      attemptCount: row.attempt_count,
      lastError: row.last_error,
      lastAttemptedAt: row.last_attempted_at,
      downloadedAt: row.downloaded_at,
    }
  }
}

const syncRunSelectColumns = `
  sync_runs.id,
  sync_runs.status,
  sync_runs.phase,
  sync_runs.source,
  sync_runs.started_at,
  sync_runs.finished_at,
  sync_runs.scanned_count,
  sync_runs.imported_count,
  sync_runs.message,
  sync_run_checkpoints.resumable_from_phase,
  COALESCE(media_download_job_stats.failed_media_count, 0) AS failed_media_count,
  COALESCE(media_download_job_stats.retryable_media_count, 0) AS retryable_media_count,
  COALESCE(media_download_job_stats.pending_media_count, 0) AS pending_media_count,
  COALESCE(media_download_job_stats.completed_media_count, 0) AS completed_media_count,
  COALESCE(media_download_job_stats.total_media_count, 0) AS total_media_count
`

function normalizeArchiveLimit(limit: number | undefined) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return 24
  }

  return Math.min(200, Math.max(1, Math.trunc(limit)))
}

function normalizeArchiveSearch(search: string | undefined) {
  if (typeof search !== "string") {
    return ""
  }

  return search.trim().toLowerCase()
}

function escapeSqlLikePattern(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")
}