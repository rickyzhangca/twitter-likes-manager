import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, clipboard, ipcMain, nativeImage, protocol, shell } from "electron";
import {
	type ArchiveQueryOptions,
	type DesktopAppState,
	desktopChannels,
	desktopMediaScheme,
	type SyncStartOptions,
} from "../src/types/desktop";
import { ArchiveStore } from "./archive-store";
import { SyncService } from "./sync-service";

const applicationName = "Twitter Likes Manager";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.join(__dirname, "preload.mjs");
let archiveStore: ArchiveStore | null = null;
let syncService: SyncService | null = null;

protocol.registerSchemesAsPrivileged([
	{
		scheme: desktopMediaScheme,
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			stream: true,
			corsEnabled: true,
		},
	},
]);

app.setName(applicationName);
app.setPath("userData", path.join(app.getPath("appData"), applicationName));

function getAppState(): DesktopAppState {
	const archiveState = archiveStore?.getAppState() ?? {
		dataDirectory: app.getPath("userData"),
		services: [
			{
				id: "electron-shell",
				label: "Electron shell",
				status: "ready",
			},
			{
				id: "storage-layer",
				label: "Local storage",
				status: "blocked",
			},
			{
				id: "capture-worker",
				label: "Capture worker",
				status: "planned",
			},
		],
	};

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
	};
}

function registerIpcHandlers() {
	ipcMain.handle(desktopChannels.getAppState, () => getAppState());
	ipcMain.handle(
		desktopChannels.getArchiveSnapshot,
		(_event, options?: ArchiveQueryOptions) => {
			if (!archiveStore) {
				throw new Error("Archive store is not initialized");
			}

			return archiveStore.getArchiveSnapshot(options);
		},
	);
	ipcMain.handle(desktopChannels.getSyncState, () => {
		if (!syncService) {
			throw new Error("Sync service is not initialized");
		}

		return syncService.getSyncState();
	});
	ipcMain.handle(
		desktopChannels.startSync,
		(_event, options?: SyncStartOptions) => {
			if (!syncService) {
				throw new Error("Sync service is not initialized");
			}

			return syncService.startSync(options);
		},
	);
	ipcMain.handle(desktopChannels.resumeSync, () => {
		if (!syncService) {
			throw new Error("Sync service is not initialized");
		}

		return syncService.resumeSync();
	});
	ipcMain.handle(desktopChannels.retryFailedMediaForRun, (_event, runId: string) => {
		if (!syncService) {
			throw new Error("Sync service is not initialized");
		}

		return syncService.retryFailedMediaForRun(runId);
	});
	ipcMain.handle(desktopChannels.ping, () => "pong");
	ipcMain.handle(desktopChannels.openDataDirectory, async () => {
		const result = await shell.openPath(app.getPath("userData"));

		if (result) {
			throw new Error(result);
		}
	});
	ipcMain.handle(desktopChannels.copyImageToClipboard, async (_event, localPath: string) => {
		const image = nativeImage.createFromBuffer(await readFile(localPath));
		clipboard.writeImage(image);
	});
	ipcMain.handle(desktopChannels.showItemInFolder, (_event, localPath: string) => {
		shell.showItemInFolder(localPath);
	});
}

function registerMediaProtocol() {
	protocol.handle(desktopMediaScheme, async (request) => {
		if (!archiveStore) {
			return new Response("Archive store is not initialized", {
				status: 503,
			});
		}

		const requestUrl = new URL(request.url);
		const requestedPath = requestUrl.searchParams.get("path");

		if (!requestedPath) {
			return new Response("Missing media path", { status: 400 });
		}

		if (
			requestUrl.protocol !== `${desktopMediaScheme}:` ||
			requestUrl.hostname !== "local-file" ||
			(requestUrl.pathname !== "" && requestUrl.pathname !== "/")
		) {
			return new Response("Forbidden media path", { status: 403 });
		}

		const mediaRoot = path.resolve(archiveStore.mediaDirectory);
		const resolvedPath = path.resolve(requestedPath);
		const relativePath = path.relative(mediaRoot, resolvedPath);

		if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
			return new Response("Forbidden media path", { status: 403 });
		}

		try {
			const fileContent = await readFile(resolvedPath);

			return new Response(fileContent, {
				headers: {
					"content-type": resolveMediaContentType(resolvedPath),
					"cache-control": "public, max-age=31536000, immutable",
				},
			});
		} catch (error) {
			console.warn(
				`[desktop-media] failed to read ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`,
			);
			return new Response("Media not found", { status: 404 });
		}
	});
}

function resolveMediaContentType(filePath: string) {
	switch (path.extname(filePath).toLowerCase()) {
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".png":
			return "image/png";
		case ".gif":
			return "image/gif";
		case ".webp":
			return "image/webp";
		case ".mp4":
			return "video/mp4";
		default:
			return "application/octet-stream";
	}
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
	});

	if (process.env.VITE_DEV_SERVER_URL) {
		await window.loadURL(process.env.VITE_DEV_SERVER_URL);
		window.webContents.openDevTools({ mode: "detach" });
	} else {
		await window.loadFile(path.join(__dirname, "../dist/index.html"));
	}
}

process.on("message", (message) => {
	if (message !== "electron-vite&type=hot-reload") {
		return;
	}

	for (const window of BrowserWindow.getAllWindows()) {
		window.webContents.reload();
	}
});

app.whenReady().then(async () => {
	archiveStore = new ArchiveStore({ dataDirectory: app.getPath("userData") });
	syncService = new SyncService(archiveStore);
	registerMediaProtocol();
	registerIpcHandlers();
	await createMainWindow();

	if (process.env.TLM_AUTOSTART_SYNC === "1") {
		syncService.startSync();
	}

	app.on("activate", async () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			await createMainWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
