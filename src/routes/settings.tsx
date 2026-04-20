/* eslint-disable react-refresh/only-export-components */

import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	const { handleOpenDataDirectory, isOpeningDataDir } = useWorkspace();

	return (
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
				</div>
			</div>
		</div>
	);
}
