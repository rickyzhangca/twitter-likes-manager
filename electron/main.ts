import { app, BrowserWindow, ipcMain, shell } from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { ArchiveStore } from "./archive-store"
import {
  desktopChannels,
  type DesktopAppState,
} from "../src/types/desktop"

const applicationName = "Twitter Likes Manager"
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const preloadPath = path.join(__dirname, "preload.mjs")
let archiveStore: ArchiveStore | null = null

app.setName(applicationName)
app.setPath("userData", path.join(app.getPath("appData"), applicationName))

function getAppState(): DesktopAppState {
  const archiveState = archiveStore?.getAppState() ?? {
    dataDirectory: app.getPath("userData"),
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
        status: "blocked",
        detail: "Archive store has not been initialized yet.",
      },
      {
        id: "capture-worker",
        label: "Capture worker",
        status: "planned",
        detail:
          "A Playwright worker will own signed-in capture of the Likes timeline.",
      },
    ],
  }

  return {
    runtime: "electron",
    appName: app.getName(),
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    dataDirectory: archiveState.dataDirectory,
    versions: {
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron,
    },
    services: archiveState.services,
  }
}

function registerIpcHandlers() {
  ipcMain.handle(desktopChannels.getAppState, () => getAppState())
  ipcMain.handle(desktopChannels.getArchiveSnapshot, () => {
    if (!archiveStore) {
      throw new Error("Archive store is not initialized")
    }

    return archiveStore.getArchiveSnapshot()
  })
  ipcMain.handle(desktopChannels.ping, () => "pong")
  ipcMain.handle(desktopChannels.openDataDirectory, async () => {
    const result = await shell.openPath(app.getPath("userData"))

    if (result) {
      throw new Error(result)
    }
  })
}

async function createMainWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#0f0f10",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL)
    window.webContents.openDevTools({ mode: "detach" })
  } else {
    await window.loadFile(path.join(__dirname, "../dist/index.html"))
  }
}

process.on("message", (message) => {
  if (message !== "electron-vite&type=hot-reload") {
    return
  }

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.reload()
  }
})

app.whenReady().then(async () => {
  archiveStore = new ArchiveStore({ dataDirectory: app.getPath("userData") })
  registerIpcHandlers()
  await createMainWindow()

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})