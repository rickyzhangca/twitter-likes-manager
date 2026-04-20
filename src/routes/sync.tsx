/* eslint-disable react-refresh/only-export-components */

import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
	defaultSyncLimit,
	formatDate,
	maxSyncLimit,
	useWorkspace,
} from "@/hooks/use-workspace";

export const Route = createFileRoute("/sync")({
	component: SyncPage,
});

function SyncPage() {
	const {
		handleResumeSync,
		handleRetryFailedMediaForRun,
		isResumingSync,
		isRetryingFailedMedia,
		handleStartSync,
		isStartingSync,
		setSyncLimitInput,
		syncLimitInput,
		syncState,
	} = useWorkspace();
	const runDetails = syncState.activeRun ?? syncState.resumableRun;

	return (
		<div className="grid gap-6">
			<div className="flex items-start justify-between gap-4">
				<div className="flex flex-wrap items-center gap-3">
					<Button
						onClick={() => {
							void handleStartSync();
						}}
						disabled={
							!syncState.canStart ||
							isStartingSync ||
							isResumingSync ||
							isRetryingFailedMedia
						}
					>
						{isStartingSync
							? "Starting sync..."
							: syncState.activeRun
								? "Sync running"
								: "Start sync"}
					</Button>
					{syncState.resumableRun ? (
						<Button
							variant="outline"
							onClick={() => {
								void handleResumeSync();
							}}
							disabled={
								Boolean(syncState.activeRun) ||
								isStartingSync ||
								isResumingSync ||
								isRetryingFailedMedia
							}
						>
							{isResumingSync ? "Resuming..." : "Resume sync"}
						</Button>
					) : null}
					{runDetails?.failedMediaCount ? (
						<Button
							variant="secondary"
							onClick={() => {
								void handleRetryFailedMediaForRun(runDetails.id);
							}}
							disabled={
								Boolean(syncState.activeRun) ||
								isStartingSync ||
								isResumingSync ||
								isRetryingFailedMedia
							}
						>
							{isRetryingFailedMedia
								? "Retrying failed media..."
								: `Retry ${runDetails.failedMediaCount} failed media`}
						</Button>
					) : null}
				</div>
			</div>

			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<label className="grid gap-2 text-sm text-foreground">
					<span>Sync limit</span>
					<input
						type="number"
						min={1}
						max={maxSyncLimit}
						step={1}
						inputMode="numeric"
						value={syncLimitInput}
						disabled={
							Boolean(syncState.activeRun) ||
							isStartingSync ||
							isResumingSync ||
							isRetryingFailedMedia
						}
						onChange={(event) => setSyncLimitInput(event.target.value)}
						className="w-full min-w-40 border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary sm:w-44"
					/>
				</label>
				<p className="max-w-xl text-sm leading-6 text-muted-foreground">
					Allowed range: 1 to {maxSyncLimit}. Default: {defaultSyncLimit}.
				</p>
			</div>

			<div>
				<p>{syncState.activeRun ? "Active run" : "Latest resumable state"}</p>
				{runDetails ? (
					<div>
						<div className="flex items-center justify-between gap-3 text-sm">
							<span>{runDetails.phase}</span>
							<span>{runDetails.status}</span>
						</div>
						<p className="mt-3 text-sm leading-6 text-foreground">
							{runDetails.message}
						</p>
						<dl className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
							<div>
								<dt>Started</dt>
								<dd className="mt-1 text-foreground">
									{formatDate(runDetails.startedAt)}
								</dd>
							</div>
							<div>
								<dt>Imported</dt>
								<dd className="mt-1 text-foreground">
									{runDetails.importedCount} rows
								</dd>
							</div>
							<div>
								<dt>Scanned</dt>
								<dd className="mt-1 text-foreground">
									{runDetails.scannedCount} likes
								</dd>
							</div>
							<div>
								<dt>Source</dt>
								<dd className="mt-1 text-foreground">{runDetails.source}</dd>
							</div>
							<div>
								<dt>Checkpoint</dt>
								<dd className="mt-1 text-foreground">
									{runDetails.hasResumableCheckpoint &&
									runDetails.resumableFromPhase
										? `Resume from ${runDetails.resumableFromPhase}`
										: "No saved checkpoint"}
								</dd>
							</div>
							<div>
								<dt>Failed media</dt>
								<dd className="mt-1 text-foreground">
									{runDetails.failedMediaCount}
								</dd>
							</div>
							{runDetails.downloadProgress ? (
								<div>
									<dt>Media progress</dt>
									<dd className="mt-1 text-foreground">
										{runDetails.downloadProgress.completedCount}/
										{runDetails.downloadProgress.totalCount} downloaded,{" "}
										{runDetails.downloadProgress.pendingCount} pending
									</dd>
								</div>
							) : null}
							{!syncState.activeRun && runDetails.finishedAt ? (
								<div>
									<dt>Finished</dt>
									<dd className="mt-1 text-foreground">
										{formatDate(runDetails.finishedAt)}
									</dd>
								</div>
							) : null}
						</dl>
						{!syncState.activeRun && syncState.resumableRun ? (
							<p className="mt-4 text-sm leading-6 text-muted-foreground">
								This run has a saved checkpoint and can continue without redoing
								completed phases.
							</p>
						) : null}
					</div>
				) : (
					<p className="text-sm">
						No sync is running and no checkpoint is saved yet. Starting one now
						opens the persistent browser profile and waits for an authenticated
						X session before capture.
					</p>
				)}
			</div>
		</div>
	);
}
