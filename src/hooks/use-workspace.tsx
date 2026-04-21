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
	DesktopAppState,
	SyncStartOptions,
	SyncState,
} from "@/types/desktop";

export const defaultSyncLimit = 200;

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
		},
		{
			id: "storage-layer",
			label: "Local storage",
			status: "planned",
		},
		{
			id: "capture-worker",
			label: "Capture worker",
			status: "planned",
		},
	],
};

const browserPreviewArchive: ArchiveSnapshot = {
	databasePath: null,
	dataDirectory: null,
	stats: {
		tweetCount: 0,
		filteredTweetCount: 0,
		authorCount: 0,
		mediaCount: 0,
		latestImportedAt: null,
	},
	tags: [],
	tweets: [],
};

const browserPreviewSyncState: SyncState = {
	canStart: true,
	activeRun: null,
	resumableRun: null,
	recentRuns: [],
};

const archivePageSize = 24;

type ArchiveLoadOptions = {
	page?: number;
	search?: string;
	tagFilters?: string[];
};

type WorkspaceContextValue = {
	appState: DesktopAppState;
	archive: ArchiveSnapshot;
	archivePage: number;
	archiveSearchInput: string;
	archiveTagFilters: string[];
	archiveTotalPages: number;
	bridgeStatus: string;
	deferredArchiveSearch: string;
	handleDeleteTweets: (tweetIds: string[]) => Promise<void>;
	handleOpenDataDirectory: () => Promise<void>;
	handleResumeSync: () => Promise<void>;
	handleSaveTweetTags: (tweetId: string, tagNames: string[]) => Promise<void>;
	handleDeleteTag: (tagName: string) => Promise<void>;
	handleSetArchivePage: (page: number) => void;
	handleStartSync: () => Promise<void>;
	handleRetryFailedMediaForRun: (runId: string) => Promise<void>;
	isLoadingArchive: boolean;
	isOpeningDataDir: boolean;
	isResumingSync: boolean;
	isRetryingFailedMedia: boolean;
	isStartingSync: boolean;
	setArchiveSearchInput: (value: string) => void;
	setArchiveTagFilters: (tags: string[]) => void;
	setBridgeStatus: (value: string) => void;
	setSyncLimitInput: (value: string) => void;
	syncLimitInput: string;
	syncState: SyncState;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function normalizeSyncLimit(value: string) {
	const trimmed = value.trim();

	if (trimmed === "") {
		return Infinity;
	}

	const parsedValue = Number.parseInt(trimmed, 10);

	if (!Number.isFinite(parsedValue) || parsedValue < 1) {
		return defaultSyncLimit;
	}

	return parsedValue;
}

function loadStoredSyncLimit() {
	const storedValue = window.localStorage.getItem(syncLimitStorageKey);

	if (!storedValue) {
		return String(defaultSyncLimit);
	}

	if (storedValue === "unlimited") {
		return "";
	}

	return String(normalizeSyncLimit(storedValue));
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

function createArchiveQuery({
	page = 1,
	search = "",
	tagFilters = [],
}: ArchiveLoadOptions = {}) {
	return {
		search,
		tags: tagFilters,
		limit: archivePageSize,
		offset: (page - 1) * archivePageSize,
	};
}

async function loadDesktopArchiveSnapshot(options: ArchiveLoadOptions = {}) {
	const desktopBridge = window.twitterLikesDesktop;

	if (!desktopBridge) {
		return browserPreviewArchive;
	}

	return desktopBridge.getArchiveSnapshot(createArchiveQuery(options));
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
	const [isResumingSync, setIsResumingSync] = useState(false);
	const [isRetryingFailedMedia, setIsRetryingFailedMedia] = useState(false);
	const [isStartingSync, setIsStartingSync] = useState(false);
	const [archiveSearchInput, setArchiveSearchInputState] = useState("");
	const [archiveTagFilters, setArchiveTagFiltersState] = useState<string[]>([]);
	const [syncLimitInput, setSyncLimitInput] = useState(() =>
		loadStoredSyncLimit(),
	);
	const deferredArchiveSearch = useDeferredValue(archiveSearchInput.trim());
	const [archivePage, setArchivePage] = useState(1);

	const archiveTotalPages =
		Math.ceil(archive.stats.filteredTweetCount / archivePageSize) || 1;

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
		if (!window.twitterLikesDesktop) {
			return;
		}

		let isDisposed = false;

		void loadDesktopArchiveSnapshot({
			page: archivePage,
			search: deferredArchiveSearch,
			tagFilters: archiveTagFilters,
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
	}, [archivePage, archiveTagFilters, deferredArchiveSearch]);

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
						const nextArchive = await loadDesktopArchiveSnapshot({
							page: archivePage,
							search: deferredArchiveSearch,
							tagFilters: archiveTagFilters,
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
	}, [
		archivePage,
		archiveTagFilters,
		deferredArchiveSearch,
		syncState.activeRun,
	]);

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
			const normalizedMaxTweets = normalizeSyncLimit(syncLimitInput);
			const options: SyncStartOptions = {
				maxTweets: normalizedMaxTweets,
			};
			const nextSyncState = await window.twitterLikesDesktop.startSync(options);
			setSyncState(nextSyncState);
			window.localStorage.setItem(
				syncLimitStorageKey,
				normalizedMaxTweets === Infinity
					? "unlimited"
					: String(normalizedMaxTweets),
			);
			setSyncLimitInput(
				normalizedMaxTweets === Infinity ? "" : String(normalizedMaxTweets),
			);
			setBridgeStatus(
				normalizedMaxTweets === Infinity
					? "Started a desktop-managed sync run with no limit."
					: `Started a desktop-managed sync run with a ${options.maxTweets}-tweet limit.`,
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Could not start sync";
			setBridgeStatus(`Start sync failed: ${message}`);
		} finally {
			setIsStartingSync(false);
		}
	}

	async function handleResumeSync() {
		if (!window.twitterLikesDesktop) {
			setBridgeStatus("Resume is only available in the Electron shell.");
			return;
		}

		setIsResumingSync(true);

		try {
			const nextSyncState = await window.twitterLikesDesktop.resumeSync();
			setSyncState(nextSyncState);
			setBridgeStatus("Resumed the latest checkpointed sync run.");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Could not resume sync";
			setBridgeStatus(`Resume sync failed: ${message}`);
		} finally {
			setIsResumingSync(false);
		}
	}

	async function handleRetryFailedMediaForRun(runId: string) {
		if (!window.twitterLikesDesktop) {
			setBridgeStatus(
				"Retry controls are only available in the Electron shell.",
			);
			return;
		}

		setIsRetryingFailedMedia(true);

		try {
			const nextSyncState =
				await window.twitterLikesDesktop.retryFailedMediaForRun(runId);
			setSyncState(nextSyncState);
			setBridgeStatus("Retrying failed media downloads for the selected run.");
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Could not retry failed media downloads";
			setBridgeStatus(`Retry failed media failed: ${message}`);
		} finally {
			setIsRetryingFailedMedia(false);
		}
	}

	async function handleSaveTweetTags(tweetId: string, tagNames: string[]) {
		if (!window.twitterLikesDesktop) {
			setBridgeStatus("Tag editing is only available in the Electron shell.");
			return;
		}

		setIsLoadingArchive(true);

		try {
			await window.twitterLikesDesktop.saveTweetTags(tweetId, tagNames);

			let nextArchive = await loadDesktopArchiveSnapshot({
				page: archivePage,
				search: deferredArchiveSearch,
				tagFilters: archiveTagFilters,
			});
			const nextArchiveTotalPages =
				Math.ceil(nextArchive.stats.filteredTweetCount / archivePageSize) || 1;

			if (archivePage > nextArchiveTotalPages) {
				setArchivePage(nextArchiveTotalPages);
				nextArchive = await loadDesktopArchiveSnapshot({
					page: nextArchiveTotalPages,
					search: deferredArchiveSearch,
					tagFilters: archiveTagFilters,
				});
			}

			startTransition(() => {
				setArchive(nextArchive);
			});
			setBridgeStatus("Updated tweet tags.");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Could not update tweet tags";
			setBridgeStatus(`Update tweet tags failed: ${message}`);
		} finally {
			setIsLoadingArchive(false);
		}
	}

	async function handleDeleteTweets(tweetIds: string[]) {
		if (!window.twitterLikesDesktop) {
			setBridgeStatus(
				"Tweet deletion is only available in the Electron shell.",
			);
			return;
		}

		const normalizedTweetIds = [
			...new Set(tweetIds.map((tweetId) => tweetId.trim()).filter(Boolean)),
		];

		if (normalizedTweetIds.length === 0) {
			return;
		}

		setIsLoadingArchive(true);

		try {
			await window.twitterLikesDesktop.deleteTweets(normalizedTweetIds);

			let nextArchive = await loadDesktopArchiveSnapshot({
				page: archivePage,
				search: deferredArchiveSearch,
				tagFilters: archiveTagFilters,
			});
			const nextArchiveTotalPages =
				Math.ceil(nextArchive.stats.filteredTweetCount / archivePageSize) || 1;

			if (archivePage > nextArchiveTotalPages) {
				setArchivePage(nextArchiveTotalPages);
				nextArchive = await loadDesktopArchiveSnapshot({
					page: nextArchiveTotalPages,
					search: deferredArchiveSearch,
					tagFilters: archiveTagFilters,
				});
			}

			startTransition(() => {
				setArchive(nextArchive);
			});
			setBridgeStatus(
				`Deleted ${normalizedTweetIds.length} tweet${normalizedTweetIds.length === 1 ? "" : "s"}.`,
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Could not delete tweets";
			setBridgeStatus(`Delete tweets failed: ${message}`);
		} finally {
			setIsLoadingArchive(false);
		}
	}

	async function handleDeleteTag(tagName: string) {
		if (!window.twitterLikesDesktop) {
			setBridgeStatus("Tag deletion is only available in the Electron shell.");
			return;
		}

		setIsLoadingArchive(true);

		try {
			await window.twitterLikesDesktop.deleteTag(tagName);

			const nextTagFilters = archiveTagFilters.filter((t) => t !== tagName);

			let nextArchive = await loadDesktopArchiveSnapshot({
				page: archivePage,
				search: deferredArchiveSearch,
				tagFilters: nextTagFilters,
			});
			const nextArchiveTotalPages =
				Math.ceil(nextArchive.stats.filteredTweetCount / archivePageSize) || 1;

			if (archivePage > nextArchiveTotalPages) {
				setArchivePage(nextArchiveTotalPages);
				nextArchive = await loadDesktopArchiveSnapshot({
					page: nextArchiveTotalPages,
					search: deferredArchiveSearch,
					tagFilters: nextTagFilters,
				});
			}

			startTransition(() => {
				setArchive(nextArchive);
			});
			setArchiveTagFiltersState(nextTagFilters);
			setBridgeStatus(`Deleted tag "${tagName}".`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Could not delete tag";
			setBridgeStatus(`Delete tag failed: ${message}`);
		} finally {
			setIsLoadingArchive(false);
		}
	}

	function setArchiveSearchInput(value: string) {
		if (window.twitterLikesDesktop) {
			setIsLoadingArchive(true);
		}

		setArchiveSearchInputState(value);
		setArchivePage(1);
	}

	function setArchiveTagFilters(tags: string[]) {
		const nextTags = normalizeArchiveTagFilters(tags);

		if (areArchiveTagFiltersEqual(archiveTagFilters, nextTags)) {
			return;
		}

		if (window.twitterLikesDesktop) {
			setIsLoadingArchive(true);
		}

		setArchiveTagFiltersState(nextTags);
		setArchivePage(1);
	}

	function handleSetArchivePage(page: number) {
		if (window.twitterLikesDesktop) {
			setIsLoadingArchive(true);
		}

		setArchivePage(page);
	}

	return (
		<WorkspaceContext.Provider
			value={{
				appState,
				archive,
				archivePage,
				archiveSearchInput,
				archiveTagFilters,
				archiveTotalPages,
				bridgeStatus,
				deferredArchiveSearch,
				handleDeleteTweets,
				handleDeleteTag,
				handleOpenDataDirectory,
				handleResumeSync,
				handleSaveTweetTags,
				handleRetryFailedMediaForRun,
				handleSetArchivePage,
				handleStartSync,
				isLoadingArchive,
				isOpeningDataDir,
				isResumingSync,
				isRetryingFailedMedia,
				isStartingSync,
				setArchiveSearchInput,
				setArchiveTagFilters,
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

function normalizeArchiveTagFilters(tags: string[]) {
	return [
		...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
	];
}

function areArchiveTagFiltersEqual(currentTags: string[], nextTags: string[]) {
	if (currentTags.length !== nextTags.length) {
		return false;
	}

	return currentTags.every((tag, index) => tag === nextTags[index]);
}
