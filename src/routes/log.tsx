/* eslint-disable react-refresh/only-export-components */

import { CheckCircleIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatDate, useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/log")({
	component: LogPage,
});

function LogPage() {
	const { appState, archive, syncState } = useWorkspace();

	return (
		<div className="flex flex-col gap-4">
			<section className="flex rounded-md border border-border">
				{appState.services.map((service) => (
					<article key={service.id} className="p-3">
						<div className="flex items-center gap-1">
							{service.status === "ready" && (
								<CheckCircleIcon
									weight="fill"
									className="fill-green-600"
									size={20}
								/>
							)}
							<span className="text-sm">{service.label}</span>
						</div>
					</article>
				))}
			</section>

			<section>
				<div className="flex rounded-md border border-border">
					<div className="py-3 px-4 text-sm border-r border-border">
						<p className="opacity-50">Archive rows</p>
						<p>{archive.stats.tweetCount} tweets</p>
					</div>
					<div className="py-3 px-4 text-sm border-r border-border">
						<p className="opacity-50">Sync state</p>
						<p>
							{syncState.activeRun
								? `${syncState.activeRun.importedCount} imported`
								: "Idle"}
						</p>
					</div>
					<div className="py-3 px-4 text-sm border-r border-border">
						<p className="opacity-50">Resumable runs</p>
						<p>{syncState.resumableRun ? "1 available" : "None"}</p>
					</div>
					<div className="py-3 px-4 text-sm border-r border-border">
						<p className="opacity-50">Recent runs</p>
						<p>{syncState.recentRuns.length} stored</p>
					</div>
				</div>
			</section>

			<section>
				{syncState.recentRuns.length === 0 ? (
					<p className="text-sm leading-6 text-muted-foreground">
						No runs recorded yet. The first manual run will be stored in the
						local archive database.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Started</TableHead>
								<TableHead>Finished</TableHead>
								<TableHead>Phase</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="text-right">Scanned</TableHead>
								<TableHead className="text-right">Imported</TableHead>
								<TableHead className="text-right">Failed media</TableHead>
								<TableHead className="text-right">Retryable</TableHead>
								<TableHead>Checkpoint</TableHead>
								<TableHead>Message</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{syncState.recentRuns.map((run) => (
								<TableRow key={run.id}>
									<TableCell className="whitespace-nowrap text-sm">
										{formatDate(run.startedAt)}
									</TableCell>
									<TableCell className="whitespace-nowrap text-sm">
										{run.finishedAt ? formatDate(run.finishedAt) : "—"}
									</TableCell>
									<TableCell className="text-sm">{run.phase}</TableCell>
									<TableCell className="text-sm">{run.status}</TableCell>
									<TableCell className="text-right text-sm">
										{run.scannedCount}
									</TableCell>
									<TableCell className="text-right text-sm">
										{run.importedCount}
									</TableCell>
									<TableCell className="text-right text-sm">
										{run.failedMediaCount}
									</TableCell>
									<TableCell className="text-right text-sm">
										{run.retryableMediaCount}
									</TableCell>
									<TableCell className="text-sm">
										{run.hasResumableCheckpoint && run.resumableFromPhase
											? run.resumableFromPhase
											: "—"}
									</TableCell>
									<TableCell className="max-w-50 truncate text-sm">
										{run.message}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</section>
		</div>
	);
}
