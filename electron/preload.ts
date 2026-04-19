import { contextBridge, ipcRenderer } from "electron"

import { desktopChannels, type DesktopBridge } from "../src/types/desktop"

const desktopBridge: DesktopBridge = {
  getAppState: () => ipcRenderer.invoke(desktopChannels.getAppState),
  getArchiveSnapshot: () => ipcRenderer.invoke(desktopChannels.getArchiveSnapshot),
  getSyncState: () => ipcRenderer.invoke(desktopChannels.getSyncState),
  startSync: () => ipcRenderer.invoke(desktopChannels.startSync),
  ping: () => ipcRenderer.invoke(desktopChannels.ping),
  openDataDirectory: () => ipcRenderer.invoke(desktopChannels.openDataDirectory),
}

contextBridge.exposeInMainWorld("twitterLikesDesktop", desktopBridge)