import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import type { ArchiveMedia } from "../src/types/desktop"

type MediaDownloadItem = {
  id: string
  kind: ArchiveMedia["kind"]
  remoteUrl: string
}

type DownloadedMedia = {
  id: string
  localPath: string | null
  attemptCount: number
}

type MediaDownloadSummary = {
  downloadedCount: number
  failedCount: number
  results: DownloadedMedia[]
}

type MediaDownloadHooks = {
  onAttemptStart?: (
    item: MediaDownloadItem,
    attemptCount: number,
  ) => Promise<void> | void
  onAttemptFailure?: (
    item: MediaDownloadItem,
    attemptCount: number,
    errorMessage: string,
  ) => Promise<void> | void
  onDownloadSuccess?: (
    item: MediaDownloadItem,
    download: DownloadedMedia,
  ) => Promise<void> | void
}

const mediaDownloadConcurrency = 4
const retryDelaysMs = [0, 400, 1200]

export class MediaDownloader {
  private readonly mediaDirectory: string

  constructor(mediaDirectory: string) {
    this.mediaDirectory = mediaDirectory
  }

  async downloadAll(
    items: MediaDownloadItem[],
    hooks?: MediaDownloadHooks,
  ): Promise<MediaDownloadSummary> {
    if (items.length === 0) {
      return {
        downloadedCount: 0,
        failedCount: 0,
        results: [],
      }
    }

    await mkdir(this.mediaDirectory, { recursive: true })

    const results: DownloadedMedia[] = new Array(items.length)
    let nextItemIndex = 0

    await Promise.all(
      Array.from({ length: Math.min(mediaDownloadConcurrency, items.length) }, async () => {
        while (nextItemIndex < items.length) {
          const currentIndex = nextItemIndex
          nextItemIndex += 1
          results[currentIndex] = await this.downloadWithRetry(items[currentIndex], hooks)
        }
      })
    )

    return {
      downloadedCount: results.filter((result) => result.localPath).length,
      failedCount: results.filter((result) => !result.localPath).length,
      results,
    }
  }

  private async downloadWithRetry(
    item: MediaDownloadItem,
    hooks?: MediaDownloadHooks,
  ): Promise<DownloadedMedia> {
    let attemptCount = 0

    for (const retryDelayMs of retryDelaysMs) {
      attemptCount += 1

      await hooks?.onAttemptStart?.(item, attemptCount)

      if (retryDelayMs > 0) {
        await delay(retryDelayMs)
      }

      try {
        const response = await fetch(item.remoteUrl, {
          redirect: "follow",
          headers: {
            Accept: "image/*,video/*,*/*;q=0.8",
          },
        })

        if (!response.ok) {
          throw new Error(`Unexpected ${response.status} response`)
        }

        const fileExtension = resolveFileExtension(
          item,
          response.headers.get("content-type"),
        )
        const filePath = path.join(this.mediaDirectory, `${item.id}${fileExtension}`)
        const content = new Uint8Array(await response.arrayBuffer())

        await writeFile(filePath, content)

        const download = {
          id: item.id,
          localPath: filePath,
          attemptCount,
        }

        await hooks?.onDownloadSuccess?.(item, download)

        return download
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(
          `[sync] media download failed for ${item.remoteUrl} on attempt ${attemptCount}: ${message}`,
        )
        await hooks?.onAttemptFailure?.(item, attemptCount, message)
      }
    }

    return {
      id: item.id,
      localPath: null,
      attemptCount,
    }
  }
}

function resolveFileExtension(
  item: MediaDownloadItem,
  contentType: string | null,
) {
  const urlPathname = safeUrlPathname(item.remoteUrl)
  const pathnameExtension = path.extname(urlPathname).toLowerCase()

  if (pathnameExtension && pathnameExtension.length <= 5) {
    return pathnameExtension
  }

  if (contentType?.includes("image/jpeg")) {
    return ".jpg"
  }

  if (contentType?.includes("image/png")) {
    return ".png"
  }

  if (contentType?.includes("image/webp")) {
    return ".webp"
  }

  if (contentType?.includes("image/gif")) {
    return ".gif"
  }

  if (contentType?.includes("video/mp4")) {
    return ".mp4"
  }

  return item.kind === "photo" ? ".jpg" : ".mp4"
}

function safeUrlPathname(remoteUrl: string) {
  try {
    return new URL(remoteUrl).pathname
  } catch {
    return remoteUrl
  }
}