import {
	ArrowsClockwiseIcon,
	FolderIcon,
	HardDrivesIcon,
	HouseIcon,
	type Icon,
	MonitorIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	SidebarSeparator,
} from "@/components/ui/sidebar";
import type {
	ArchiveSnapshot,
	DesktopAppState,
	SyncState,
} from "@/types/desktop";

type AppSidebarProps = {
	appState: DesktopAppState;
	archive: ArchiveSnapshot;
	bridgeStatus: string;
	currentPath: string;
	isOpeningDataDir: boolean;
	onOpenDataDirectory: () => void;
	syncState: SyncState;
};

type NavigationItem = {
	label: string;
	helpText: string;
	icon: Icon;
	badge?: string;
	to: "/overview" | "/services" | "/sync" | "/archive";
};

function formatCompactCount(value: number) {
	return new Intl.NumberFormat(undefined, {
		notation: value >= 1000 ? "compact" : "standard",
		maximumFractionDigits: 1,
	}).format(value);
}

export function AppSidebar({
	appState,
	archive,
	bridgeStatus,
	currentPath,
	isOpeningDataDir,
	onOpenDataDirectory,
	syncState,
}: AppSidebarProps) {
	const navigationItems: NavigationItem[] = [
		{
			label: "Overview",
			icon: HouseIcon,
			helpText: "Hero summary and environment state.",
			to: "/overview",
		},
		{
			label: "Services",
			icon: MonitorIcon,
			badge: String(appState.services.length),
			helpText: "Main process and bridge readiness.",
			to: "/services",
		},
		{
			label: "Sync",
			icon: ArrowsClockwiseIcon,
			badge: syncState.activeRun ? "Live" : undefined,
			helpText: "Desktop-managed capture controls and run history.",
			to: "/sync",
		},
		{
			label: "Archive",
			icon: HardDrivesIcon,
			badge: formatCompactCount(archive.stats.tweetCount),
			helpText: "Stored tweets, media, and recent rows.",
			to: "/archive",
		},
	];

	const activeItem =
		navigationItems.find((item) => item.to === currentPath) ??
		navigationItems[0];
	const runtimeSummary = `${appState.runtime} runtime`;
	const activeRunLabel = syncState.activeRun
		? `${syncState.activeRun.importedCount} imported`
		: "Idle";

	return (
		<Sidebar variant="inset" collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							render={<Link preload="intent" to="/overview" />}
							size="lg"
							isActive={currentPath === "/overview"}
							tooltip="Overview"
						>
							<HouseIcon />
							<span className="grid flex-1 text-left leading-tight">
								<span className="font-medium text-sidebar-foreground">
									{appState.appName}
								</span>
								<span className="text-sidebar-foreground/70">
									{runtimeSummary}
								</span>
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarSeparator />

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Workspace</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{navigationItems.map((item) => {
								const Icon = item.icon;

								return (
									<SidebarMenuItem key={item.to}>
										<SidebarMenuButton
											render={<Link preload="intent" to={item.to} />}
											isActive={currentPath === item.to}
											tooltip={item.label}
										>
											<Icon />
											<span>{item.label}</span>
										</SidebarMenuButton>
										{item.badge ? (
											<SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
										) : null}
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupLabel>Snapshot</SidebarGroupLabel>
					<SidebarGroupContent>
						<div className="grid gap-2 group-data-[collapsible=icon]:hidden">
							<div className="border border-sidebar-border bg-sidebar-accent/20 p-3 text-xs">
								<p className="text-sidebar-foreground/70">Archive rows</p>
								<p className="mt-1 font-medium text-sidebar-foreground">
									{formatCompactCount(archive.stats.tweetCount)} tweets
								</p>
							</div>
							<div className="border border-sidebar-border bg-sidebar-accent/20 p-3 text-xs">
								<p className="text-sidebar-foreground/70">Sync state</p>
								<p className="mt-1 font-medium text-sidebar-foreground">
									{activeRunLabel}
								</p>
							</div>
							<div className="border border-sidebar-border bg-sidebar-accent/20 p-3 text-xs">
								<p className="text-sidebar-foreground/70">Recent runs</p>
								<p className="mt-1 font-medium text-sidebar-foreground">
									{syncState.recentRuns.length} stored
								</p>
							</div>
						</div>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupLabel>Section notes</SidebarGroupLabel>
					<SidebarGroupContent>
						<div className="border border-dashed border-sidebar-border p-3 text-xs leading-5 text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
							{activeItem.helpText}
						</div>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							onClick={onOpenDataDirectory}
							disabled={isOpeningDataDir}
							tooltip="Open data directory"
						>
							<FolderIcon />
							<span>
								{isOpeningDataDir
									? "Opening directory..."
									: "Open data directory"}
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>

				<div className="flex flex-col gap-1 text-xs opacity-50">
					<p className="mt-1">Version {appState.appVersion}</p>
					<p>Runtime: {appState.runtime}</p>
					<p className="font-medium text-sidebar-foreground">
						Bridge: {bridgeStatus}
					</p>
					<p>{appState.isPackaged ? "Packaged build" : "Development build"}</p>
				</div>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
