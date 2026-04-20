import {
	ArrowsClockwiseIcon,
	GearIcon,
	HouseIcon,
	type Icon,
	ListIcon,
	TwitterLogoIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
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
	syncState: SyncState;
};

type NavigationItem = {
	label: string;
	icon: Icon;
	badge?: string;
	to: "/home" | "/sync" | "/log" | "/settings";
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
	syncState,
}: AppSidebarProps) {
	const navigationItems: NavigationItem[] = [
		{
			label: "Home",
			icon: HouseIcon,
			badge: formatCompactCount(archive.stats.tweetCount),
			to: "/home",
		},
		{
			label: "Sync",
			icon: ArrowsClockwiseIcon,
			badge: syncState.activeRun ? "Live" : undefined,
			to: "/sync",
		},
		{
			label: "Log",
			icon: ListIcon,
			to: "/log",
		},
		{
			label: "Settings",
			icon: GearIcon,
			to: "/settings",
		},
	];

	return (
		<Sidebar variant="inset">
			<SidebarHeader className="mt-5 px-0">
				<SidebarMenuButton
					render={<Link preload="intent" to="/home" search={{ page: 1 }} />}
					size="lg"
					tooltip="Home"
				>
					<TwitterLogoIcon weight="fill" />
					<span className="font-medium text-sidebar-foreground">
						{appState.appName}
					</span>
				</SidebarMenuButton>
			</SidebarHeader>

			<SidebarContent>
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
			</SidebarContent>

			<SidebarFooter>
				<div className="flex flex-col gap-1 text-sm opacity-50">
					<p>Version {appState.appVersion}</p>
					<p>Runtime: {appState.runtime}</p>
					<p>Bridge: {bridgeStatus}</p>
					<p>{appState.isPackaged ? "Packaged build" : "Dev build"}</p>
				</div>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
