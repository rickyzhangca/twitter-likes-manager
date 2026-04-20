/* eslint-disable react-refresh/only-export-components */

import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/overview")({
	component: OverviewPage,
});

function OverviewPage() {
	const {
		appState,
		bridgeStatus,
		handleOpenDataDirectory,
		isOpeningDataDir,
		setBridgeStatus,
	} = useWorkspace();

	return (
		<div className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
			<div className="border border-border bg-card/80 p-6 backdrop-blur lg:p-8">
				<div className="space-y-5">
					<div className="flex flex-wrap gap-3">
						<Button
							onClick={() => {
								void handleOpenDataDirectory();
							}}
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
		</div>
	);
}
