import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

import type {
  ArchiveMedia,
  ArchiveQueryOptions,
  ArchiveSnapshot,
  ArchiveTag,
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

type TweetTagRow = {
  tweet_id: string
  tag_name: string
}

type ArchiveTagRow = {
  name: string
  tweet_count: number | null
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
    const offset = normalizeArchiveOffset(options?.offset)
    const searchTerm = normalizeArchiveSearch(options?.search)
    const selectedTags = normalizeArchiveTags(options?.tags)
    const sortOrder = options?.sortOrder === "asc" ? "ASC" : "DESC"
    const archiveFilters = buildArchiveFilters({ searchTerm, selectedTags })

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

    const filteredTweetCount = archiveFilters.hasFilters
      ? (
          this.database
            .prepare(
              `
                SELECT COUNT(DISTINCT tweets.id) AS cnt
                FROM tweets
                JOIN authors ON authors.id = tweets.author_id
                WHERE ${archiveFilters.whereClause}
              `
            )
            .get(...archiveFilters.params) as {
            cnt: number
          }
        ).cnt
      : stats.tweet_count

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
          WHERE ${archiveFilters.whereClause}
          GROUP BY tweets.id
          ORDER BY tweets.imported_at ${sortOrder}
            LIMIT ?
            OFFSET ?
        `
      )
        .all(
          ...archiveFilters.params,
          limit,
          offset,
        ) as TweetRow[]

    const tweetTagsById = this.listTagsForTweetIds(tweetRows.map((tweet) => tweet.id))

    const availableTags = this.database
      .prepare(
        `
          SELECT
            tags.name,
            COUNT(DISTINCT CASE WHEN tweets.source = 'like' THEN tweet_tags.tweet_id END) AS tweet_count
          FROM tags
          LEFT JOIN tweet_tags ON tweet_tags.tag_name = tags.name
          LEFT JOIN tweets ON tweets.id = tweet_tags.tweet_id
          GROUP BY tags.name
          ORDER BY lower(tags.name) ASC
        `
      )
      .all() as ArchiveTagRow[]

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
        filteredTweetCount,
        authorCount: stats.author_count,
        mediaCount: stats.media_count,
        latestImportedAt: stats.latest_imported_at,
      },
      tags: availableTags.map((tag): ArchiveTag => ({
        name: tag.name,
        tweetCount: tag.tweet_count ?? 0,
      })),
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
        tags: tweetTagsById.get(tweet.id) ?? [],
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
              tags: [],
              media: (mediaStatement.all(tweet.qt_id ?? "") as Array<{
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

  saveTweetTags(tweetId: string, tagNames: string[]) {
    const normalizedTagNames = normalizeArchiveTags(tagNames)
    const tweetExists = this.database
      .prepare("SELECT 1 AS exists_flag FROM tweets WHERE id = ?")
      .get(tweetId) as { exists_flag: number } | undefined

    if (!tweetExists) {
      throw new Error(`Tweet ${tweetId} does not exist`)
    }

    const insertTag = this.database.prepare(
      `
        INSERT INTO tags (name)
        VALUES (?)
        ON CONFLICT(name) DO NOTHING
      `
    )
    const deleteTagsForTweet = this.database.prepare(
      `
        DELETE FROM tweet_tags
        WHERE tweet_id = ?
      `
    )
    const insertTweetTag = this.database.prepare(
      `
        INSERT INTO tweet_tags (tweet_id, tag_name)
        VALUES (?, ?)
        ON CONFLICT(tweet_id, tag_name) DO NOTHING
      `
    )

    this.database.exec("BEGIN")

    try {
      deleteTagsForTweet.run(tweetId)

      for (const tagName of normalizedTagNames) {
        insertTag.run(tagName)
        insertTweetTag.run(tweetId, tagName)
      }

      this.database.exec("COMMIT")
    } catch (error) {
      this.database.exec("ROLLBACK")
      throw error
    }
  }

  deleteTweets(tweetIds: string[]) {
    const normalizedTweetIds = [...new Set(tweetIds.map((tweetId) => tweetId.trim()).filter(Boolean))]

    if (normalizedTweetIds.length === 0) {
      return
    }

    const selectedTweetRows = this.database
      .prepare(
        `
          SELECT id, quoted_tweet_id
          FROM tweets
          WHERE source = 'like'
            AND id IN (${normalizedTweetIds.map(() => "?").join(", ")})
        `
      )
      .all(...normalizedTweetIds) as Array<{
      id: string
      quoted_tweet_id: string | null
    }>

    if (selectedTweetRows.length === 0) {
      return
    }

    const selectedTweetIds = selectedTweetRows.map((row) => row.id)
    const quotedTweetIds = [
      ...new Set(
        selectedTweetRows
          .map((row) => row.quoted_tweet_id)
          .filter((tweetId): tweetId is string => Boolean(tweetId))
      ),
    ]

    const orphanedQuotedTweetIds =
      quotedTweetIds.length === 0
        ? []
        : (
            this.database
              .prepare(
                `
                  SELECT quoted.id
                  FROM tweets AS quoted
                  WHERE quoted.source = 'quoted'
                    AND quoted.id IN (${quotedTweetIds.map(() => "?").join(", ")})
                    AND NOT EXISTS (
                      SELECT 1
                      FROM tweets AS refs
                      WHERE refs.quoted_tweet_id = quoted.id
                        AND refs.id NOT IN (${selectedTweetIds.map(() => "?").join(", ")})
                    )
                `
              )
              .all(...quotedTweetIds, ...selectedTweetIds) as Array<{ id: string }>
          ).map((row) => row.id)

    const allTweetIdsToDelete = [...new Set([...selectedTweetIds, ...orphanedQuotedTweetIds])]
    const localMediaPaths = this.listLocalMediaPathsForTweetIds(allTweetIdsToDelete)

    this.database.exec("BEGIN")

    try {
      this.database
        .prepare(
          `
            DELETE FROM tweets
            WHERE id IN (${allTweetIdsToDelete.map(() => "?").join(", ")})
          `
        )
        .run(...allTweetIdsToDelete)

      this.database.exec(`
        DELETE FROM authors
        WHERE id NOT IN (SELECT DISTINCT author_id FROM tweets);

        DELETE FROM tags
        WHERE name NOT IN (SELECT DISTINCT tag_name FROM tweet_tags);
      `)

      this.database.exec("COMMIT")
    } catch (error) {
      this.database.exec("ROLLBACK")
      throw error
    }

    for (const localMediaPath of localMediaPaths) {
      this.removeLocalMediaFile(localMediaPath)
    }
  }

  deleteTag(tagName: string) {
    const normalizedName = tagName.trim().toLowerCase()
    this.database
      .prepare("DELETE FROM tags WHERE name = ?")
      .run(normalizedName)
  }

  listMediaPendingDownload(limit?: number): Array<{
    id: string
    kind: ArchiveMedia["kind"]
    remoteUrl: string
  }> {
    const normalizedLimit =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? Math.trunc(limit)
        : null

    const rows = this.database
      .prepare(
        `
          SELECT media.id, media.kind, media.remote_url
          FROM media
          JOIN tweets ON tweets.id = media.tweet_id
          WHERE media.local_path IS NULL
          ORDER BY tweets.imported_at DESC, media.id ASC
          ${normalizedLimit ? "LIMIT ?" : ""}
        `
      )
      .all(...(normalizedLimit ? [normalizedLimit] : [])) as MediaDownloadRow[]

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
    const storedMaxTweets = maxTweets === Infinity ? -1 : maxTweets

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
      .run(runId, storedMaxTweets, now)

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
        (updates.maxTweets ?? currentCheckpoint.maxTweets) === Infinity
          ? -1
          : (updates.maxTweets ?? currentCheckpoint.maxTweets),
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

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        name TEXT PRIMARY KEY
      ) STRICT;

      CREATE TABLE IF NOT EXISTS tweet_tags (
        tweet_id TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
        tag_name TEXT NOT NULL REFERENCES tags(name) ON DELETE CASCADE,
        PRIMARY KEY (tweet_id, tag_name)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_tweet_tags_tag_name
      ON tweet_tags (tag_name, tweet_id);
    `)
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

      CREATE TABLE IF NOT EXISTS tags (
        name TEXT PRIMARY KEY
      ) STRICT;

      CREATE TABLE IF NOT EXISTS tweet_tags (
        tweet_id TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
        tag_name TEXT NOT NULL REFERENCES tags(name) ON DELETE CASCADE,
        PRIMARY KEY (tweet_id, tag_name)
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

      CREATE INDEX IF NOT EXISTS idx_tweet_tags_tag_name
      ON tweet_tags (tag_name, tweet_id);
    `)
  }

  private removeSeedData() {
    this.database.exec(`
      DELETE FROM media WHERE id LIKE 'media-%';
      DELETE FROM tweets WHERE id LIKE 'tweet-%';
      DELETE FROM authors WHERE id LIKE 'author-%';
    `)
  }

  private listTagsForTweetIds(tweetIds: string[]) {
    const tagsByTweetId = new Map<string, string[]>()

    if (tweetIds.length === 0) {
      return tagsByTweetId
    }

    const rows = this.database
      .prepare(
        `
          SELECT tweet_id, tag_name
          FROM tweet_tags
          WHERE tweet_id IN (${tweetIds.map(() => "?").join(", ")})
          ORDER BY lower(tag_name) ASC
        `
      )
      .all(...tweetIds) as TweetTagRow[]

    for (const row of rows) {
      const existingTags = tagsByTweetId.get(row.tweet_id)

      if (existingTags) {
        existingTags.push(row.tag_name)
        continue
      }

      tagsByTweetId.set(row.tweet_id, [row.tag_name])
    }

    return tagsByTweetId
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
      maxTweets: row.max_tweets === -1 ? Infinity : row.max_tweets,
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

  private listLocalMediaPathsForTweetIds(tweetIds: string[]) {
    if (tweetIds.length === 0) {
      return []
    }

    const rows = this.database
      .prepare(
        `
          SELECT local_path
          FROM media
          WHERE tweet_id IN (${tweetIds.map(() => "?").join(", ")})
            AND local_path IS NOT NULL
        `
      )
      .all(...tweetIds) as Array<{ local_path: string | null }>

    return [...new Set(rows.map((row) => row.local_path).filter((localPath): localPath is string => Boolean(localPath)))]
  }

  private removeLocalMediaFile(localPath: string) {
    const resolvedMediaRoot = path.resolve(this.mediaDirectory)
    const resolvedMediaPath = path.resolve(localPath)
    const relativePath = path.relative(resolvedMediaRoot, resolvedMediaPath)

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return
    }

    rmSync(resolvedMediaPath, { force: true })
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

function buildArchiveFilters({
  searchTerm,
  selectedTags,
}: {
  searchTerm: string
  selectedTags: string[]
}) {
  const conditions = ["tweets.source = 'like'"]
  const params: Array<number | string> = []

  if (searchTerm) {
    const escapedSearchTerm = `%${escapeSqlLikePattern(searchTerm)}%`

    conditions.push(`(
      lower(tweets.text) LIKE ? ESCAPE '\\'
      OR lower(authors.username) LIKE ? ESCAPE '\\'
      OR lower(authors.display_name) LIKE ? ESCAPE '\\'
    )`)
    params.push(escapedSearchTerm, escapedSearchTerm, escapedSearchTerm)
  }

  if (selectedTags.length > 0) {
    conditions.push(`tweets.id IN (
      SELECT tweet_tags.tweet_id
      FROM tweet_tags
      JOIN tweets tagged_tweets ON tagged_tweets.id = tweet_tags.tweet_id
      WHERE tagged_tweets.source = 'like'
        AND tweet_tags.tag_name IN (${selectedTags.map(() => "?").join(", ")})
      GROUP BY tweet_tags.tweet_id
      HAVING COUNT(DISTINCT tweet_tags.tag_name) = ?
    )`)
    params.push(...selectedTags, selectedTags.length)
  }

  return {
    hasFilters: Boolean(searchTerm) || selectedTags.length > 0,
    params,
    whereClause: conditions.join("\n                  AND "),
  }
}

function normalizeArchiveLimit(limit: number | undefined) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return 24
  }

  return Math.min(200, Math.max(1, Math.trunc(limit)))
}

function normalizeArchiveOffset(offset: number | undefined) {
  if (typeof offset !== "number" || !Number.isFinite(offset)) {
    return 0
  }

  return Math.max(0, Math.trunc(offset))
}

function normalizeArchiveSearch(search: string | undefined) {
  if (typeof search !== "string") {
    return ""
  }

  return search.trim().toLowerCase()
}

function normalizeArchiveTags(tags: string[] | undefined) {
  if (!tags) {
    return []
  }

  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
}

function escapeSqlLikePattern(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")
}