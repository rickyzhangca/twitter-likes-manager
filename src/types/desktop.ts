export const desktopChannels = {
  getAppState: "desktop:get-app-state",
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
  ping: () => Promise<string>
  openDataDirectory: () => Promise<void>
}