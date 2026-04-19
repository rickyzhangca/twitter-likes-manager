export const desktopChannels = {
  getAppState: "desktop:get-app-state",
  getArchiveSnapshot: "desktop:get-archive-snapshot",
  getSyncState: "desktop:get-sync-state",
  startSync: "desktop:start-sync",
  ping: "desktop:ping",
  openDataDirectory: "desktop:open-data-directory",
} as const

export type DesktopServiceStatus = "ready" | "planned" | "blocked"

export type DesktopService = {
  id: "electron-shell" | "storage-layer" | "capture-worker"
  label: string
  status: DesktopServiceStatus
  detail: string
}

export type ArchiveMedia = {
  id: string
  kind: "photo" | "video" | "gif"
  remoteUrl: string
  localPath: string | null
}

export type ArchiveTweetPreview = {
  id: string
  url: string
  text: string
  likedAt: string
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
  media: ArchiveMedia[]
}

export type ArchiveSnapshot = {
  databasePath: string | null
  dataDirectory: string | null
  stats: {
    tweetCount: number
    authorCount: number
    mediaCount: number
    latestLikedAt: string | null
  }
  tweets: ArchiveTweetPreview[]
}

export type SyncPhase =
  | "idle"
  | "launching-profile"
  | "checking-session"
  | "awaiting-login"
  | "capturing-likes"
  | "normalizing-results"
  | "completed"
  | "failed"

export type SyncRunStatus = "idle" | "running" | "completed" | "failed"

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
}

export type SyncStartOptions = {
  maxTweets: number
}

export type SyncState = {
  canStart: boolean
  activeRun: SyncRun | null
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
  getArchiveSnapshot: () => Promise<ArchiveSnapshot>
  getSyncState: () => Promise<SyncState>
  startSync: (options: SyncStartOptions) => Promise<SyncState>
  ping: () => Promise<string>
  openDataDirectory: () => Promise<void>
}