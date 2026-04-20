import { Outlet, useRouterState } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { useWorkspace, WorkspaceProvider } from "@/hooks/use-workspace";

export function AppShell() {
	return (
		<WorkspaceProvider>
			<AppFrame />
		</WorkspaceProvider>
	);
}

function AppFrame() {
	const currentPath = useRouterState({
		select: (state) => state.location.pathname,
	});
	const {
		appState,
		archive,
		bridgeStatus,
		handleOpenDataDirectory,
		isOpeningDataDir,
		syncState,
	} = useWorkspace();

	return (
		<div className="w-full">
			<SidebarProvider defaultOpen>
				<AppSidebar
					appState={appState}
					archive={archive}
					bridgeStatus={bridgeStatus}
					currentPath={currentPath}
					isOpeningDataDir={isOpeningDataDir}
					onOpenDataDirectory={handleOpenDataDirectory}
					syncState={syncState}
				/>
				<SidebarInset>
					<header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-2 backdrop-blur [-webkit-app-region:drag] sm:px-6">
						<SidebarTrigger className="shrink-0 [-webkit-app-region:no-drag]" />
						<p className="truncate text-sm font-medium text-foreground">
							{appState.appName}
						</p>
						<div className="hidden text-right text-xs text-muted-foreground sm:block">
							<p>{syncState.activeRun ? "Sync active" : "Sync idle"}</p>
						</div>
					</header>

					<div className="flex flex-1 flex-col gap-6 px-4 py-4 sm:px-6 lg:py-6">
						<Outlet />
					</div>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}
