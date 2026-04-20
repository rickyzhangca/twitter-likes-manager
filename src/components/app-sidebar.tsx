import {
	ArrowsClockwiseIcon,
	FolderIcon,
	HardDrivesIcon,
	HouseIcon,
	type Icon,
	ListBulletsIcon,
	MonitorIcon,
	TargetIcon,
} from "@phosphor-icons/react";

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

export const appSectionIds = [
	"overview",
	"services",
	"sync",
	"archive",
	"roadmap",
] as const;

export type AppSectionId = (typeof appSectionIds)[number];

type AppSidebarProps = {
	activeSection: AppSectionId;
	appState: DesktopAppState;
	archive: ArchiveSnapshot;
	bridgeStatus: string;
	isOpeningDataDir: boolean;
	onOpenDataDirectory: () => void;
	onSelectSection: (section: AppSectionId) => void;
	sectionAnchors: Record<AppSectionId, string>;
	syncState: SyncState;
};

type NavigationItem = {
	id: AppSectionId;
	label: string;
	icon: Icon;
	badge?: string;
	helpText: string;
};

function formatCompactCount(value: number) {
	return new Intl.NumberFormat(undefined, {
		notation: value >= 1000 ? "compact" : "standard",
		maximumFractionDigits: 1,
	}).format(value);
}

function scrollToSection(anchorId: string) {
	document.getElementById(anchorId)?.scrollIntoView({
		behavior: "smooth",
		block: "start",
	});
}

export function AppSidebar({
	activeSection,
	appState,
	archive,
	bridgeStatus,
	isOpeningDataDir,
	onOpenDataDirectory,
	onSelectSection,
	sectionAnchors,
	syncState,
}: AppSidebarProps) {
	const navigationItems: NavigationItem[] = [
		{
			id: "overview",
			label: "Overview",
			icon: HouseIcon,
			helpText: "Hero summary and environment state.",
		},
		{
			id: "services",
			label: "Services",
			icon: MonitorIcon,
			badge: String(appState.services.length),
			helpText: "Main process and bridge readiness.",
		},
		{
			id: "sync",
			label: "Sync",
			icon: ArrowsClockwiseIcon,
			badge: syncState.activeRun ? "Live" : undefined,
			helpText: "Desktop-managed capture controls and run history.",
		},
		{
			id: "archive",
			label: "Archive",
			icon: HardDrivesIcon,
			badge: formatCompactCount(archive.stats.tweetCount),
			helpText: "Stored tweets, media, and recent rows.",
		},
		{
			id: "roadmap",
			label: "Roadmap",
			icon: TargetIcon,
			helpText: "Planned screens and next milestones.",
		},
	];

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
							size="lg"
							tooltip="Overview"
							onClick={() => {
								onSelectSection("overview");
								scrollToSection(sectionAnchors.overview);
							}}
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

				<div className="border border-sidebar-border bg-sidebar-accent/30 p-3 text-xs text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
					<p className="font-medium text-sidebar-foreground">Bridge status</p>
					<p className="mt-2 leading-5">{bridgeStatus}</p>
				</div>
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
									<SidebarMenuItem key={item.id}>
										<SidebarMenuButton
											isActive={activeSection === item.id}
											tooltip={item.label}
											onClick={() => {
												onSelectSection(item.id);
												scrollToSection(sectionAnchors[item.id]);
											}}
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
							{
								navigationItems.find((item) => item.id === activeSection)
									?.helpText
							}
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
					<SidebarMenuItem>
						<SidebarMenuButton
							tooltip="Jump to sync controls"
							onClick={() => {
								onSelectSection("sync");
								scrollToSection(sectionAnchors.sync);
							}}
						>
							<ListBulletsIcon />
							<span>Jump to sync controls</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>

				<div className="border border-sidebar-border bg-sidebar-accent/20 p-3 text-[11px] leading-5 text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
					<p className="font-medium text-sidebar-foreground">Environment</p>
					<p className="mt-1">Version {appState.appVersion}</p>
					<p>{appState.isPackaged ? "Packaged build" : "Development build"}</p>
				</div>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
