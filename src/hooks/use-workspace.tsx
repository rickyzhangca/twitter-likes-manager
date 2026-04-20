/* eslint-disable react-refresh/only-export-components */

import {
	createContext,
	type ReactNode,
	startTransition,
	useContext,
	useDeferredValue,
	useEffect,
	useState,
} from "react";

import type {
	ArchiveSnapshot,
	ArchiveTweetPreview,
	DesktopAppState,
	DesktopService,
	SyncRun,
	SyncStartOptions,
	SyncState,
} from "@/types/desktop";

export const defaultSyncLimit = 200;
export const maxSyncLimit = 1000;

const syncLimitStorageKey = "tlm.sync-limit";

const browserPreviewState: DesktopAppState = {
	runtime: "browser",
	appName: "Twitter Likes Manager",
	appVersion: "0.0.1",
	isPackaged: false,
	platform: navigator.platform,
	dataDirectory: null,
	versions: {
		node: null,
		chrome: null,
		electron: null,
	},
	services: [
		{
			id: "electron-shell",
			label: "Electron shell",
			status: "planned",
			detail: "Start the app with `pnpm dev` to boot the desktop shell.",
		},
		{
			id: "storage-layer",
			label: "Local storage",
			status: "planned",
			detail: "SQLite and media storage will land in the next slice.",
		},
		{
			id: "capture-worker",
			label: "Capture worker",
			status: "planned",
			detail: "Playwright-based like sync has not been wired yet.",
		},
	],
};

const browserPreviewArchive: ArchiveSnapshot = {
	databasePath: null,
	dataDirectory: null,
	stats: {
		tweetCount: 0,
		authorCount: 0,
		mediaCount: 0,
		latestLikedAt: null,
	},
	tweets: [],
};

const browserPreviewSyncState: SyncState = {
	canStart: true,
	activeRun: null,
	recentRuns: [],
};

type WorkspaceContextValue = {
	appState: DesktopAppState;
	archive: ArchiveSnapshot;
	archiveSearchInput: string;
	bridgeStatus: string;
	deferredArchiveSearch: string;
	handleOpenDataDirectory: () => Promise<void>;
	handleStartSync: () => Promise<void>;
	isLoadingArchive: boolean;
	isOpeningDataDir: boolean;
	isStartingSync: boolean;
	setArchiveSearchInput: (value: string) => void;
	setBridgeStatus: (value: string) => void;
	setSyncLimitInput: (value: string) => void;
	syncLimitInput: string;
	syncState: SyncState;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function normalizeSyncLimit(value: string) {
	const parsedValue = Number.parseInt(value, 10);

	if (!Number.isFinite(parsedValue)) {
		return defaultSyncLimit;
	}

	return Math.min(maxSyncLimit, Math.max(1, parsedValue));
}

function loadStoredSyncLimit() {
	const storedValue = window.localStorage.getItem(syncLimitStorageKey);

	return storedValue
		? String(normalizeSyncLimit(storedValue))
		: String(defaultSyncLimit);
}

export function formatDate(isoString: string | null) {
	if (!isoString) {
		return "not available";
	}

	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(isoString));
}

export function stateTone(tweet: ArchiveTweetPreview) {
	if (tweet.state === "available") {
		return "border-primary/30 text-foreground";
	}

	if (tweet.state === "planned") {
		return "border-border bg-background/80 text-muted-foreground";
	}

	return "border-destructive/30 bg-destructive/10 text-foreground";
}

export function syncTone(run: SyncRun) {
	if (run.status === "completed") {
		return "border-primary/30 text-foreground";
	}

	if (run.status === "failed") {
		return "border-destructive/30 bg-destructive/10 text-foreground";
	}

	return "border-border bg-background/80 text-foreground";
}

export function serviceTone(service: DesktopService) {
	if (service.status === "ready") {
		return "border-primary/40 text-foreground";
	}

	if (service.status === "blocked") {
		return "border-destructive/30 bg-destructive/10 text-foreground";
	}

	return "border-border bg-card text-muted-foreground";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
	const [appState, setAppState] =
		useState<DesktopAppState>(browserPreviewState);
	const [archive, setArchive] = useState<ArchiveSnapshot>(
		browserPreviewArchive,
	);
	const [syncState, setSyncState] = useState<SyncState>(
		browserPreviewSyncState,
	);
	const [bridgeStatus, setBridgeStatus] = useState(
		"Browser preview mode. Desktop services are idle until Electron boots.",
	);
	const [isOpeningDataDir, setIsOpeningDataDir] = useState(false);
	const [isLoadingArchive, setIsLoadingArchive] = useState(() =>
		Boolean(window.twitterLikesDesktop),
	);
	const [isStartingSync, setIsStartingSync] = useState(false);
	const [archiveSearchInput, setArchiveSearchInputState] = useState("");
	const [syncLimitInput, setSyncLimitInput] = useState(() =>
		loadStoredSyncLimit(),
	);
	const deferredArchiveSearch = useDeferredValue(archiveSearchInput.trim());

	useEffect(() => {
		let isDisposed = false;

		async function loadDesktopState() {
			if (!window.twitterLikesDesktop) {
				return;
			}

			const [nextState, nextSyncState, pong] = await Promise.all([
				window.twitterLikesDesktop.getAppState(),
				window.twitterLikesDesktop.getSyncState(),
				window.twitterLikesDesktop.ping(),
			]);

			if (isDisposed) {
				return;
			}

			setAppState(nextState);
			setSyncState(nextSyncState);
			setBridgeStatus(`Online, ${pong}`);
		}

		void loadDesktopState().catch((error: unknown) => {
			if (isDisposed) {
				return;
			}

			const message =
				error instanceof Error ? error.message : "Unknown preload bridge error";
			setBridgeStatus(`Failed, ${message}`);
		});

		return () => {
			isDisposed = true;
		};
	}, []);

	useEffect(() => {
		const desktopBridge = window.twitterLikesDesktop;

		if (!desktopBridge) {
			return;
		}

		let isDisposed = false;

		void desktopBridge
			.getArchiveSnapshot({
				search: deferredArchiveSearch,
				limit: deferredArchiveSearch ? 60 : 24,
			})
			.then((nextArchive) => {
				if (isDisposed) {
					return;
				}

				startTransition(() => {
					setArchive(nextArchive);
				});
				setIsLoadingArchive(false);
			})
			.catch((error: unknown) => {
				if (isDisposed) {
					return;
				}

				const message =
					error instanceof Error
						? error.message
						: "Unknown archive loading error";
				setBridgeStatus(`Archive load failed, ${message}`);
				setIsLoadingArchive(false);
			});

		return () => {
			isDisposed = true;
		};
	}, [deferredArchiveSearch]);

	useEffect(() => {
		const desktopBridge = window.twitterLikesDesktop;

		if (!desktopBridge || !syncState.activeRun) {
			return;
		}

		const timer = window.setInterval(() => {
			void desktopBridge
				.getSyncState()
				.then(async (nextSyncState) => {
					setSyncState(nextSyncState);

					if (!nextSyncState.activeRun) {
						setIsLoadingArchive(true);
						const nextArchive = await desktopBridge.getArchiveSnapshot({
							search: deferredArchiveSearch,
							limit: deferredArchiveSearch ? 60 : 24,
						});
						setArchive(nextArchive);
						setIsLoadingArchive(false);
					}
				})
				.catch((error: unknown) => {
					setIsLoadingArchive(false);

					const message =
						error instanceof Error
							? error.message
							: "Unknown sync polling error";
					setBridgeStatus(`Sync polling failed, ${message}`);
				});
		}, 1000);

		return () => {
			window.clearInterval(timer);
		};
	}, [deferredArchiveSearch, syncState.activeRun]);

	async function handleOpenDataDirectory() {
		if (!window.twitterLikesDesktop) {
			setBridgeStatus(
				"Data directory is only available in the Electron shell.",
			);
			return;
		}

		setIsOpeningDataDir(true);

		try {
			await window.twitterLikesDesktop.openDataDirectory();
			setBridgeStatus("Opened the app data directory in Finder.");
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Could not open data directory";
			setBridgeStatus(`Open data directory failed: ${message}`);
		} finally {
			setIsOpeningDataDir(false);
		}
	}

	async function handleStartSync() {
		if (!window.twitterLikesDesktop) {
			setBridgeStatus(
				"Sync controls are only available in the Electron shell.",
			);
			return;
		}

		setIsStartingSync(true);

		try {
			const options: SyncStartOptions = {
				maxTweets: normalizeSyncLimit(syncLimitInput),
			};
			const nextSyncState = await window.twitterLikesDesktop.startSync(options);
			setSyncState(nextSyncState);
			window.localStorage.setItem(
				syncLimitStorageKey,
				String(options.maxTweets),
			);
			setSyncLimitInput(String(options.maxTweets));
			setBridgeStatus(
				`Started a desktop-managed sync run with a ${options.maxTweets}-tweet limit.`,
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Could not start sync";
			setBridgeStatus(`Start sync failed: ${message}`);
		} finally {
			setIsStartingSync(false);
		}
	}

	function setArchiveSearchInput(value: string) {
		if (window.twitterLikesDesktop) {
			setIsLoadingArchive(true);
		}

		setArchiveSearchInputState(value);
	}

	return (
		<WorkspaceContext.Provider
			value={{
				appState,
				archive,
				archiveSearchInput,
				bridgeStatus,
				deferredArchiveSearch,
				handleOpenDataDirectory,
				handleStartSync,
				isLoadingArchive,
				isOpeningDataDir,
				isStartingSync,
				setArchiveSearchInput,
				setBridgeStatus,
				setSyncLimitInput,
				syncLimitInput,
				syncState,
			}}
		>
			{children}
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace() {
	const context = useContext(WorkspaceContext);

	if (!context) {
		throw new Error("useWorkspace must be used within a WorkspaceProvider.");
	}

	return context;
}
