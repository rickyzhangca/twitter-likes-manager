import { Outlet, useRouterState } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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
	const { appState, archive, bridgeStatus, syncState } = useWorkspace();

	return (
		<div className="h-svh w-full overflow-hidden">
			<SidebarProvider defaultOpen className="h-full">
				<AppSidebar
					appState={appState}
					archive={archive}
					bridgeStatus={bridgeStatus}
					currentPath={currentPath}
					syncState={syncState}
				/>
				<SidebarInset className="min-h-0">
					<ScrollArea className="min-h-0 flex-1">
						<div className="p-6">
							<Outlet />
						</div>
					</ScrollArea>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}
