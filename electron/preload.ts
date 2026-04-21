import { contextBridge, ipcRenderer } from "electron";

import { type DesktopBridge, desktopChannels } from "../src/types/desktop";

const desktopBridge: DesktopBridge = {
	getAppState: () => ipcRenderer.invoke(desktopChannels.getAppState),
	getArchiveSnapshot: (options) =>
		ipcRenderer.invoke(desktopChannels.getArchiveSnapshot, options),
	saveTweetTags: (tweetId, tagNames) =>
		ipcRenderer.invoke(desktopChannels.saveTweetTags, tweetId, tagNames),
	deleteTag: (tagName) =>
		ipcRenderer.invoke(desktopChannels.deleteTag, tagName),
	getSyncState: () => ipcRenderer.invoke(desktopChannels.getSyncState),
	startSync: (options) =>
		ipcRenderer.invoke(desktopChannels.startSync, options),
	resumeSync: () => ipcRenderer.invoke(desktopChannels.resumeSync),
	retryFailedMediaForRun: (runId) =>
		ipcRenderer.invoke(desktopChannels.retryFailedMediaForRun, runId),
	ping: () => ipcRenderer.invoke(desktopChannels.ping),
	openDataDirectory: () =>
		ipcRenderer.invoke(desktopChannels.openDataDirectory),
	copyImageToClipboard: (localPath) =>
		ipcRenderer.invoke(desktopChannels.copyImageToClipboard, localPath),
	showItemInFolder: (localPath) =>
		ipcRenderer.invoke(desktopChannels.showItemInFolder, localPath),
};

contextBridge.exposeInMainWorld("twitterLikesDesktop", desktopBridge);
