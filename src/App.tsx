import {
	startTransition,
	useDeferredValue,
	useEffect,
	useId,
	useState,
} from "react";

import { type AppSectionId, AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import type {
	ArchiveMedia,
	ArchiveSnapshot,
	ArchiveTweetPreview,
	DesktopAppState,
	DesktopService,
	SyncRun,
	SyncStartOptions,
	SyncState,
} from "@/types/desktop";
import { createDesktopMediaUrl } from "@/types/desktop";

const defaultSyncLimit = 200;
const maxSyncLimit = 1000;
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

function formatDate(isoString: string | null) {
	if (!isoString) {
		return "not available";
	}

	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(isoString));
}

function stateTone(tweet: ArchiveTweetPreview) {
	if (tweet.state === "available") {
		return "border-primary/30 bg-primary/8 text-foreground";
	}

	if (tweet.state === "planned") {
		return "border-border bg-background/80 text-muted-foreground";
	}

	return "border-destructive/30 bg-destructive/10 text-foreground";
}

function syncTone(run: SyncRun) {
	if (run.status === "completed") {
		return "border-primary/30 bg-primary/8 text-foreground";
	}

	if (run.status === "failed") {
		return "border-destructive/30 bg-destructive/10 text-foreground";
	}

	return "border-border bg-background/80 text-foreground";
}

function serviceTone(service: DesktopService) {
	if (service.status === "ready") {
		return "border-primary/40 bg-primary/8 text-foreground";
	}

	if (service.status === "blocked") {
		return "border-destructive/30 bg-destructive/10 text-foreground";
	}

	return "border-border bg-card text-muted-foreground";
}

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

function resolveMediaSource(media: ArchiveMedia) {
	if (media.localPath) {
		return window.twitterLikesDesktop
			? createDesktopMediaUrl(media.localPath)
			: media.localPath.startsWith("file://")
				? media.localPath
				: `file://${media.localPath}`;
	}

	return media.remoteUrl;
}

function TweetMediaPreview({ media }: { media: ArchiveMedia[] }) {
	if (media.length === 0) {
		return null;
	}

	return (
		<div className="mt-4 grid gap-3 sm:grid-cols-2">
			{media.map((item) => {
				const source = resolveMediaSource(item);

				return (
					<a
						key={item.id}
						href={source}
						target="_blank"
						rel="noreferrer"
						className="group block overflow-hidden border border-border bg-background/80"
					>
						{item.kind === "photo" ? (
							<img
								src={source}
								alt="Tweet media"
								loading="lazy"
								className="aspect-4/3 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
							/>
						) : (
							<div className="aspect-4/3 flex h-full w-full items-center justify-center bg-black/90 p-4 text-center text-sm text-white">
								<span>
									{item.kind === "gif" ? "Animated GIF" : "Video"} preview
								</span>
							</div>
						)}
						<div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
							<span>{item.kind}</span>
							<span>{item.localPath ? "Saved offline" : "Open remote"}</span>
						</div>
					</a>
				);
			})}
		</div>
	);
}

export function App() {
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
	const [archiveSearchInput, setArchiveSearchInput] = useState("");
	const [syncLimitInput, setSyncLimitInput] = useState(() =>
		loadStoredSyncLimit(),
	);
	const [activeSection, setActiveSection] = useState<AppSectionId>("overview");
	const deferredArchiveSearch = useDeferredValue(archiveSearchInput.trim());
	const sectionAnchorPrefix = useId().replace(/:/g, "");
	const archiveSearchInputId = `${sectionAnchorPrefix}-archive-search`;
	const sectionAnchors: Record<AppSectionId, string> = {
		overview: `${sectionAnchorPrefix}-overview`,
		services: `${sectionAnchorPrefix}-services`,
		sync: `${sectionAnchorPrefix}-sync`,
		archive: `${sectionAnchorPrefix}-archive`,
	};

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
			setBridgeStatus(`Desktop bridge online: ${pong}`);
		}

		void loadDesktopState().catch((error: unknown) => {
			if (isDisposed) {
				return;
			}

			const message =
				error instanceof Error ? error.message : "Unknown preload bridge error";
			setBridgeStatus(`Desktop bridge failed: ${message}`);
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
				setBridgeStatus(`Archive load failed: ${message}`);
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
					setBridgeStatus(`Sync polling failed: ${message}`);
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

	function handleSelectSection(section: AppSectionId) {
		setActiveSection(section);
	}

	return (
		<SidebarProvider defaultOpen>
			<AppSidebar
				activeSection={activeSection}
				appState={appState}
				archive={archive}
				bridgeStatus={bridgeStatus}
				isOpeningDataDir={isOpeningDataDir}
				onOpenDataDirectory={handleOpenDataDirectory}
				onSelectSection={handleSelectSection}
				sectionAnchors={sectionAnchors}
				syncState={syncState}
			/>
			<SidebarInset className="min-h-svh bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--color-primary)_14%,transparent),transparent_32%),linear-gradient(180deg,color-mix(in_oklab,var(--color-background)_88%,black_12%),var(--color-background))]">
				<header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur [-webkit-app-region:drag] sm:px-6 lg:px-8">
					<SidebarTrigger className="shrink-0 [-webkit-app-region:no-drag]" />
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-medium text-foreground">
							{appState.appName}
						</p>
						<p className="truncate text-xs text-muted-foreground">
							{bridgeStatus}
						</p>
					</div>
					<div className="hidden text-right text-xs text-muted-foreground sm:block">
						<p>{appState.runtime}</p>
						<p>{syncState.activeRun ? "Sync active" : "Sync idle"}</p>
					</div>
				</header>

				<div className="flex flex-1 flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
					<section
						id={sectionAnchors.overview}
						className="scroll-mt-24 grid gap-6 xl:grid-cols-[1.6fr_0.9fr]"
					>
						<div className="border border-border bg-card/80 p-6 backdrop-blur lg:p-8">
							<div className="space-y-5">
								<div className="flex flex-wrap gap-3">
									<Button
										onClick={handleOpenDataDirectory}
										disabled={isOpeningDataDir}
									>
										{isOpeningDataDir
											? "Opening data directory..."
											: "Open data directory"}
									</Button>
									<Button
										variant="outline"
										onClick={() =>
											setBridgeStatus(
												"Next implementation target: add resumable sync checkpoints and manual retry controls for failed media downloads.",
											)
										}
									>
										Next implementation target
									</Button>
								</div>
							</div>
						</div>

						<div className="grid gap-4 text-sm">
							<div className="border border-border bg-card/80 p-4 backdrop-blur">
								<div className="flex items-center justify-between gap-3">
									<span className="text-muted-foreground">Runtime</span>
									<span className="text-foreground">{appState.runtime}</span>
								</div>
								<div className="mt-3 flex items-center justify-between gap-3">
									<span className="text-muted-foreground">Bridge status</span>
									<span className="max-w-[16rem] text-right text-foreground">
										{bridgeStatus}
									</span>
								</div>
							</div>

							<div className="border border-border bg-card/80 p-4 backdrop-blur">
								<p className="text-muted-foreground">App info</p>
								<dl className="mt-3 grid gap-2 text-foreground">
									<div className="flex items-center justify-between gap-3">
										<dt>Version</dt>
										<dd>{appState.appVersion}</dd>
									</div>
									<div className="flex items-center justify-between gap-3">
										<dt>Packaged</dt>
										<dd>{appState.isPackaged ? "yes" : "no"}</dd>
									</div>
									<div className="flex items-center justify-between gap-3">
										<dt>Platform</dt>
										<dd>{appState.platform}</dd>
									</div>
									<div className="flex items-center justify-between gap-3">
										<dt>Data directory</dt>
										<dd className="max-w-56 truncate text-right">
											{appState.dataDirectory ?? "not attached"}
										</dd>
									</div>
								</dl>
							</div>
						</div>
					</section>

					<div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
						<section
							id={sectionAnchors.services}
							className="scroll-mt-24 border border-border bg-card p-6"
						>
							<div className="flex items-baseline justify-between gap-4">
								<div>
									<p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
										Process split
									</p>
									<h2 className="mt-2 text-xl font-medium">Desktop services</h2>
								</div>
								<p className="text-xs text-muted-foreground">
									Secure preload bridge
								</p>
							</div>

							<div className="mt-5 grid gap-3">
								{appState.services.map((service) => (
									<article
										key={service.id}
										className={`border p-4 transition-colors ${serviceTone(service)}`}
									>
										<div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.24em]">
											<span>{service.label}</span>
											<span>{service.status}</span>
										</div>
										<p className="mt-3 text-sm leading-6">{service.detail}</p>
									</article>
								))}
							</div>

							<div className="mt-6 border border-border bg-background/80 p-4 text-sm leading-6 text-muted-foreground">
								<p className="text-foreground">Archive database</p>
								<p className="mt-2 break-all">
									{archive.databasePath ?? "No database yet"}
								</p>
							</div>
						</section>

						<section
							id={sectionAnchors.sync}
							className="scroll-mt-24 grid gap-6"
						>
							<div className="border border-border bg-card p-6">
								<div className="flex items-start justify-between gap-4">
									<h2 className="mt-2 text-xl font-medium text-foreground">
										Desktop-managed job orchestration
									</h2>
									<Button
										onClick={handleStartSync}
										disabled={!syncState.canStart || isStartingSync}
									>
										{isStartingSync
											? "Starting sync..."
											: syncState.activeRun
												? "Sync running"
												: "Start sync"}
									</Button>
								</div>

								<div className="mt-5 border border-border bg-background/80 p-4">
									<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
										<label className="grid gap-2 text-sm text-foreground">
											<span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
												Sync limit
											</span>
											<input
												type="number"
												min={1}
												max={maxSyncLimit}
												step={1}
												inputMode="numeric"
												value={syncLimitInput}
												disabled={
													Boolean(syncState.activeRun) || isStartingSync
												}
												onChange={(event) =>
													setSyncLimitInput(event.target.value)
												}
												className="w-full min-w-40 border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary sm:w-44"
											/>
										</label>
										<p className="max-w-xl text-xs leading-6 text-muted-foreground">
											Allowed range: 1 to {maxSyncLimit}. Default:{" "}
											{defaultSyncLimit}.
										</p>
									</div>
								</div>

								<div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
									<div className="border border-border bg-background/80 p-4">
										<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
											Active run
										</p>
										{syncState.activeRun ? (
											<div
												className={`mt-4 border p-4 ${syncTone(syncState.activeRun)}`}
											>
												<div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.2em]">
													<span>{syncState.activeRun.phase}</span>
													<span>{syncState.activeRun.status}</span>
												</div>
												<p className="mt-3 text-sm leading-6 text-foreground">
													{syncState.activeRun.message}
												</p>
												<dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
													<div>
														<dt>Started</dt>
														<dd className="mt-1 text-foreground">
															{formatDate(syncState.activeRun.startedAt)}
														</dd>
													</div>
													<div>
														<dt>Imported</dt>
														<dd className="mt-1 text-foreground">
															{syncState.activeRun.importedCount} rows
														</dd>
													</div>
													<div>
														<dt>Scanned</dt>
														<dd className="mt-1 text-foreground">
															{syncState.activeRun.scannedCount} likes
														</dd>
													</div>
													<div>
														<dt>Source</dt>
														<dd className="mt-1 text-foreground">
															{syncState.activeRun.source}
														</dd>
													</div>
												</dl>
											</div>
										) : (
											<p className="mt-4 text-sm leading-6 text-muted-foreground">
												No sync is running. Starting one now opens the
												persistent browser profile and waits for an
												authenticated X session before capture.
											</p>
										)}
									</div>

									<div className="border border-border bg-background/80 p-4">
										<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
											Recent runs
										</p>
										{syncState.recentRuns.length === 0 ? (
											<p className="mt-4 text-sm leading-6 text-muted-foreground">
												No runs recorded yet. The first manual run will be
												stored in the local archive database.
											</p>
										) : (
											<div className="mt-4 grid gap-3">
												{syncState.recentRuns.map((run) => (
													<article
														key={run.id}
														className={`border p-3 ${syncTone(run)}`}
													>
														<div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.2em]">
															<span>{run.phase}</span>
															<span>{run.status}</span>
														</div>
														<p className="mt-2 text-sm leading-6 text-foreground">
															{run.message}
														</p>
														<p className="mt-2 text-xs text-muted-foreground">
															{formatDate(run.startedAt)} · {run.scannedCount}{" "}
															scanned · {run.importedCount} imported
														</p>
													</article>
												))}
											</div>
										)}
									</div>
								</div>
							</div>

							<div className="border border-border bg-card p-6">
								<p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
									Local archive
								</p>
								<div className="mt-5 grid gap-3 sm:grid-cols-3">
									<div className="border border-border bg-background/80 p-4">
										<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
											Tweets
										</p>
										<p className="mt-3 text-2xl text-foreground">
											{archive.stats.tweetCount}
										</p>
									</div>
									<div className="border border-border bg-background/80 p-4">
										<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
											Authors
										</p>
										<p className="mt-3 text-2xl text-foreground">
											{archive.stats.authorCount}
										</p>
									</div>
									<div className="border border-border bg-background/80 p-4">
										<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
											Media
										</p>
										<p className="mt-3 text-2xl text-foreground">
											{archive.stats.mediaCount}
										</p>
									</div>
								</div>
								<p className="mt-4 text-sm text-muted-foreground">
									Latest liked tweet saved:{" "}
									{formatDate(archive.stats.latestLikedAt)}
								</p>
							</div>
						</section>
					</div>

					<section
						id={sectionAnchors.archive}
						className="scroll-mt-24 grid gap-6"
					>
						<div className="border border-border bg-card p-6">
							<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
								<div>
									<p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
										Archive viewer
									</p>
									<p className="mt-2 text-sm leading-6 text-muted-foreground">
										Search the local archive by tweet text, username, or display
										name.
									</p>
								</div>
								<label
									htmlFor={archiveSearchInputId}
									className="grid gap-2 text-sm text-foreground lg:w-80"
								>
									<span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
										Search local archive
									</span>
									<Input
										id={archiveSearchInputId}
										value={archiveSearchInput}
										onChange={(event) => {
											if (window.twitterLikesDesktop) {
												setIsLoadingArchive(true);
											}
											setArchiveSearchInput(event.target.value);
										}}
										placeholder="@username, display name, or tweet text"
										autoComplete="off"
									/>
								</label>
							</div>

							<p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
								{deferredArchiveSearch
									? `Showing ${archive.tweets.length} match${archive.tweets.length === 1 ? "" : "es"} for "${deferredArchiveSearch}".`
									: `Showing the most recent ${archive.tweets.length} archived tweet${archive.tweets.length === 1 ? "" : "s"}.`}
							</p>

							{isLoadingArchive && archive.tweets.length > 0 ? (
								<p className="mt-3 text-sm text-muted-foreground">
									Refreshing archive results...
								</p>
							) : null}

							{isLoadingArchive && archive.tweets.length === 0 ? (
								<p className="mt-5 text-sm text-muted-foreground">
									{deferredArchiveSearch
										? "Searching archive..."
										: "Loading archive..."}
								</p>
							) : archive.tweets.length === 0 ? (
								<div className="mt-5 border border-border bg-background/80 p-4">
									<p className="text-sm text-muted-foreground">
										{deferredArchiveSearch
											? `No archived tweets matched "${deferredArchiveSearch}".`
											: "No archive rows yet. Start a sync to capture Likes from X into the local archive."}
									</p>
								</div>
							) : (
								<div className="mt-5 grid gap-4">
									{archive.tweets.map((tweet) => (
										<article
											key={tweet.id}
											className={`border p-4 ${stateTone(tweet)}`}
										>
											<div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.2em]">
												<span>@{tweet.author.username}</span>
												<span>{tweet.state}</span>
											</div>
											<p className="mt-3 text-sm leading-6 text-foreground">
												{tweet.text}
											</p>
											<TweetMediaPreview media={tweet.media} />
											<dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
												<div>
													<dt>Liked</dt>
													<dd className="mt-1 text-foreground">
														{formatDate(tweet.likedAt)}
													</dd>
												</div>
												<div>
													<dt>Created</dt>
													<dd className="mt-1 text-foreground">
														{formatDate(tweet.createdAt)}
													</dd>
												</div>
												<div>
													<dt>Metrics</dt>
													<dd className="mt-1 text-foreground">
														{tweet.metrics.likes} likes, {tweet.metrics.replies}{" "}
														replies
													</dd>
												</div>
												<div>
													<dt>Media</dt>
													<dd className="mt-1 text-foreground">
														{tweet.metrics.mediaCount} attached item(s)
													</dd>
												</div>
											</dl>
										</article>
									))}
								</div>
							)}
						</div>
					</section>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default App;
