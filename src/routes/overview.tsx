/* eslint-disable react-refresh/only-export-components */

import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/overview")({
	component: OverviewPage,
});

function OverviewPage() {
	const { handleOpenDataDirectory, isOpeningDataDir, setBridgeStatus } =
		useWorkspace();

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
		</div>
	);
}
