export const desktopChannels = {
  getAppState: "desktop:get-app-state",
  getArchiveSnapshot: "desktop:get-archive-snapshot",
  deleteTweets: "desktop:delete-tweets",
  saveTweetTags: "desktop:save-tweet-tags",
  deleteTag: "desktop:delete-tag",
  getSyncState: "desktop:get-sync-state",
  startSync: "desktop:start-sync",
  resumeSync: "desktop:resume-sync",
  retryFailedMediaForRun: "desktop:retry-failed-media-for-run",
  ping: "desktop:ping",
  openDataDirectory: "desktop:open-data-directory",
  copyImageToClipboard: "desktop:copy-image-to-clipboard",
  showItemInFolder: "desktop:show-item-in-folder",
} as const

export const desktopMediaScheme = "tlm-media"

export function createDesktopMediaUrl(localPath: string) {
  const url = new URL(`${desktopMediaScheme}://local-file`)
  url.searchParams.set("path", localPath)
  return url.toString()
}

export type DesktopServiceStatus = "ready" | "planned" | "blocked"

export type DesktopService = {
  id: "electron-shell" | "storage-layer" | "capture-worker"
  label: string
  status: DesktopServiceStatus
}

export type ArchiveMedia = {
  id: string
  kind: "photo" | "video" | "gif"
  remoteUrl: string
  localPath: string | null
}

export type ArchiveTag = {
  name: string
  tweetCount: number
}

export type ArchiveTweetPreview = {
  id: string
  url: string
  text: string
  importedAt: string
  createdAt: string
  state: "available" | "planned" | "deleted" | "protected"
  metrics: {
    likes: number
    replies: number
    mediaCount: number
  }
  author: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
  }
  tags: string[]
  media: ArchiveMedia[]
  quotedTweet: ArchiveTweetPreview | null
}

export type ArchiveSnapshot = {
  databasePath: string | null
  dataDirectory: string | null
  stats: {
    tweetCount: number
    filteredTweetCount: number
    authorCount: number
    mediaCount: number
    latestImportedAt: string | null
  }
  tags: ArchiveTag[]
  tweets: ArchiveTweetPreview[]
}

export type ArchiveQueryOptions = {
  search?: string
  tags?: string[]
  limit?: number
  offset?: number
}

export type SyncPhase =
  | "idle"
  | "launching-profile"
  | "checking-session"
  | "awaiting-login"
  | "capturing-likes"
  | "normalizing-results"
  | "downloading-media"
  | "completed"
  | "failed"

export type SyncRunStatus = "idle" | "running" | "completed" | "failed"

export type SyncDownloadProgress = {
  completedCount: number
  failedCount: number
  pendingCount: number
  totalCount: number
}

export type SyncRun = {
  id: string
  status: SyncRunStatus
  phase: SyncPhase
  source: "manual"
  startedAt: string
  finishedAt: string | null
  scannedCount: number
  importedCount: number
  message: string
  hasResumableCheckpoint: boolean
  resumableFromPhase: SyncPhase | null
  failedMediaCount: number
  retryableMediaCount: number
  downloadProgress: SyncDownloadProgress | null
}

export type SyncStartOptions = {
  maxTweets: number
}

export type SyncState = {
  canStart: boolean
  activeRun: SyncRun | null
  resumableRun: SyncRun | null
  recentRuns: SyncRun[]
}

export type DesktopAppState = {
  runtime: "browser" | "electron"
  appName: string
  appVersion: string
  isPackaged: boolean
  platform: string
  dataDirectory: string | null
  versions: {
    node: string | null
    chrome: string | null
    electron: string | null
  }
  services: DesktopService[]
}

export type DesktopBridge = {
  getAppState: () => Promise<DesktopAppState>
  getArchiveSnapshot: (
    options?: ArchiveQueryOptions,
  ) => Promise<ArchiveSnapshot>
  deleteTweets: (tweetIds: string[]) => Promise<void>
  saveTweetTags: (tweetId: string, tagNames: string[]) => Promise<void>
  deleteTag: (tagName: string) => Promise<void>
  getSyncState: () => Promise<SyncState>
  startSync: (options: SyncStartOptions) => Promise<SyncState>
  resumeSync: () => Promise<SyncState>
  retryFailedMediaForRun: (runId: string) => Promise<SyncState>
  ping: () => Promise<string>
  openDataDirectory: () => Promise<void>
  copyImageToClipboard: (localPath: string) => Promise<void>
  showItemInFolder: (localPath: string) => Promise<void>
}