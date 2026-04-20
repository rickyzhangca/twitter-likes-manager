import { contextBridge, ipcRenderer } from "electron";

import { type DesktopBridge, desktopChannels } from "../src/types/desktop";

const desktopBridge: DesktopBridge = {
	getAppState: () => ipcRenderer.invoke(desktopChannels.getAppState),
	getArchiveSnapshot: (options) =>
		ipcRenderer.invoke(desktopChannels.getArchiveSnapshot, options),
	getSyncState: () => ipcRenderer.invoke(desktopChannels.getSyncState),
	startSync: (options) =>
		ipcRenderer.invoke(desktopChannels.startSync, options),
	ping: () => ipcRenderer.invoke(desktopChannels.ping),
	openDataDirectory: () =>
		ipcRenderer.invoke(desktopChannels.openDataDirectory),
};

contextBridge.exposeInMainWorld("twitterLikesDesktop", desktopBridge);
