import { contextBridge, ipcRenderer } from "electron"

import { desktopChannels, type DesktopBridge } from "../src/types/desktop"

const desktopBridge: DesktopBridge = {
  getAppState: () => ipcRenderer.invoke(desktopChannels.getAppState),
  ping: () => ipcRenderer.invoke(desktopChannels.ping),
  openDataDirectory: () => ipcRenderer.invoke(desktopChannels.openDataDirectory),
}

contextBridge.exposeInMainWorld("twitterLikesDesktop", desktopBridge)