import { randomUUID } from "node:crypto";
import path from "node:path";

import type { SyncStartOptions, SyncState } from "../src/types/desktop";
import type { ArchiveStore } from "./archive-store";
import { MediaDownloader } from "./media-downloader";
import { PlaywrightSync } from "./playwright-sync";

export class SyncService {
	private readonly archiveStore: ArchiveStore;
	private readonly playwrightSync: PlaywrightSync;
	private readonly mediaDownloader: MediaDownloader;
	private activeRunId: string | null = null;

	constructor(archiveStore: ArchiveStore) {
		this.archiveStore = archiveStore;
		this.playwrightSync = new PlaywrightSync({
			profileDirectory: path.join(
				this.archiveStore.dataDirectory,
				"playwright-profile",
			),
			captureDirectory: path.join(
				this.archiveStore.dataDirectory,
				"sync-captures",
			),
		});
		this.mediaDownloader = new MediaDownloader(this.archiveStore.mediaDirectory);
	}

	getSyncState(): SyncState {
		const activeRun = this.activeRunId
			? this.archiveStore.getSyncRun(this.activeRunId)
			: null;

		if (!activeRun && this.activeRunId) {
			this.activeRunId = null;
		}

		return {
			canStart: !activeRun,
			activeRun,
			recentRuns: this.archiveStore.listSyncRuns(),
		};
	}

	startSync(options?: SyncStartOptions): SyncState {
		const currentState = this.getSyncState();

		if (currentState.activeRun) {
			return currentState;
		}

		const normalizedOptions = normalizeSyncStartOptions(options);

		const startedAt = new Date().toISOString();
		const run = this.archiveStore.createSyncRun({
			id: randomUUID(),
			status: "running",
			phase: "launching-profile",
			source: "manual",
			startedAt,
			finishedAt: null,
			scannedCount: 0,
			importedCount: 0,
			message: `Preparing the Playwright capture session for up to ${normalizedOptions.maxTweets} liked tweets.`,
		});

		this.activeRunId = run.id;
		console.log(`[sync] started run ${run.id}`);
		void this.runPlaywrightSync(run.id, normalizedOptions);

		return this.getSyncState();
	}

	private async runPlaywrightSync(
		runId: string,
		options: Required<SyncStartOptions>,
	) {
		try {
			const captureResult = await this.playwrightSync.run(options, (progress) => {
				console.log(
					`[sync] ${runId} ${progress.phase}: ${progress.message} (${progress.scannedCount} scanned, ${progress.importedCount} imported)`,
				);
				this.archiveStore.updateSyncRun(runId, {
					status: "running",
					phase: progress.phase,
					scannedCount: progress.scannedCount,
					importedCount: progress.importedCount,
					message: progress.message,
				});
			});

			let result = captureResult;

			if (captureResult.artifactPath) {
				const message =
					"Normalizing captured Likes responses into the local archive.";

				console.log(`[sync] ${runId} normalizing-results: ${message}`);
				this.archiveStore.updateSyncRun(runId, {
					status: "running",
					phase: "normalizing-results",
					scannedCount: captureResult.scannedCount,
					importedCount: 0,
					message,
				});

				const importResult = this.archiveStore.importLikesCapture(
					captureResult.artifactPath,
					options.maxTweets,
				);
				let mediaDownloadSummary = {
					downloadedCount: 0,
					failedCount: 0,
				};

				const pendingMedia = this.archiveStore.listMediaPendingDownload();

				if (pendingMedia.length > 0) {
					const downloadMessage = `Downloading ${pendingMedia.length} media file${pendingMedia.length === 1 ? "" : "s"} for offline archive viewing.`;

					console.log(`[sync] ${runId} downloading-media: ${downloadMessage}`);
					this.archiveStore.updateSyncRun(runId, {
						status: "running",
						phase: "downloading-media",
						scannedCount: importResult.scannedCount,
						importedCount: importResult.importedCount,
						message: downloadMessage,
					});

					try {
						const downloadResult = await this.mediaDownloader.downloadAll(
							pendingMedia,
						);

						for (const result of downloadResult.results) {
							if (result.localPath) {
								this.archiveStore.updateMediaLocalPath(
									result.id,
									result.localPath,
								);
							}
						}

						mediaDownloadSummary = {
							downloadedCount: downloadResult.downloadedCount,
							failedCount: downloadResult.failedCount,
						};
					} catch (error) {
						const mediaMessage =
							error instanceof Error
								? error.message
								: "Unknown media download failure";
						console.error(
							`[sync] ${runId} media download failed: ${mediaMessage}`,
						);
					}
				}

				result = {
					...captureResult,
					scannedCount: importResult.scannedCount,
					importedCount: importResult.importedCount,
					message: importResult.importedCount
						? formatCompletionMessage(
								importResult,
								mediaDownloadSummary,
								options.maxTweets,
							)
						: captureResult.message,
				};
			}

			this.archiveStore.updateSyncRun(runId, {
				status: "completed",
				phase: result.phase,
				finishedAt: new Date().toISOString(),
				scannedCount: result.scannedCount,
				importedCount: result.importedCount,
				message: result.message,
			});
			console.log(
				`[sync] ${runId} completed: ${result.message} (${result.scannedCount} scanned, ${result.importedCount} imported)`,
			);
		} catch (error) {
			await this.playwrightSync.dispose().catch(() => undefined);

			const message =
				error instanceof Error ? error.message : "Unknown sync failure";
			console.error(`[sync] ${runId} failed: ${message}`);

			this.archiveStore.updateSyncRun(runId, {
				status: "failed",
				phase: "failed",
				finishedAt: new Date().toISOString(),
				message,
			});
		} finally {
			console.log(`[sync] finished run ${runId}`);
			this.activeRunId = null;
		}
	}
}

function formatCompletionMessage(
	importResult: {
		importedCount: number;
		likesResponseCount: number;
		mediaCount: number;
	},
	mediaDownloadSummary: {
		downloadedCount: number;
		failedCount: number;
	},
	maxTweets: number,
) {
	const baseMessage = `Imported ${importResult.importedCount} liked tweets (limit ${maxTweets}) from ${importResult.likesResponseCount} captured Likes response${importResult.likesResponseCount === 1 ? "" : "s"}.`;

	if (importResult.mediaCount === 0) {
		return `${baseMessage} No media attachments were found in this batch.`;
	}

	if (
		mediaDownloadSummary.downloadedCount === 0 &&
		mediaDownloadSummary.failedCount === 0
	) {
		return `${baseMessage} Imported ${importResult.mediaCount} media attachment${importResult.mediaCount === 1 ? "" : "s"}.`;
	}

	if (mediaDownloadSummary.failedCount === 0) {
		return `${baseMessage} Downloaded ${mediaDownloadSummary.downloadedCount} media file${mediaDownloadSummary.downloadedCount === 1 ? "" : "s"} for offline viewing.`;
	}

	return `${baseMessage} Downloaded ${mediaDownloadSummary.downloadedCount} media file${mediaDownloadSummary.downloadedCount === 1 ? "" : "s"}; ${mediaDownloadSummary.failedCount} still need retry.`;
}

function normalizeSyncStartOptions(options?: SyncStartOptions) {
	const requestedLimit = options?.maxTweets;
	const maxTweets =
		typeof requestedLimit === "number" && Number.isFinite(requestedLimit)
			? Math.min(1000, Math.max(1, Math.trunc(requestedLimit)))
			: 200;

	return { maxTweets };
}
