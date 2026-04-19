import type { DesktopBridge } from "./desktop";

declare global {
	interface Window {
		twitterLikesDesktop?: DesktopBridge;
	}
}
