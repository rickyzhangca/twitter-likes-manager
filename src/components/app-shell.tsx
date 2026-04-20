import { Outlet, useRouterState } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
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
		<div className="w-full">
			<SidebarProvider defaultOpen>
				<AppSidebar
					appState={appState}
					archive={archive}
					bridgeStatus={bridgeStatus}
					currentPath={currentPath}
					syncState={syncState}
				/>
				<SidebarInset>
					<div className="p-6">
						<Outlet />
					</div>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}
