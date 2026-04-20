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
		<Button
			onClick={() => {
				void handleOpenDataDirectory();
			}}
			disabled={isOpeningDataDir}
		>
			{isOpeningDataDir ? "Opening data directory..." : "Open data directory"}
		</Button>
	);
}
