import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { type BrowserContext, chromium, type Page } from "playwright";

import type { SyncPhase } from "../src/types/desktop";

type SyncProgress = {
	phase: SyncPhase;
	message: string;
	scannedCount: number;
	importedCount: number;
};

type PlaywrightSyncOptions = {
	profileDirectory: string;
	captureDirectory: string;
};

type SyncCaptureOptions = {
	maxTweets: number;
};

type CapturedResponse = {
	url: string;
	status: number;
	contentType: string;
	body: string;
};

type ProbeResult = {
	visibleTweetCount: number;
	capturedResponseCount: number;
	artifactPath: string | null;
};

type SyncRunResult = SyncProgress & {
	artifactPath: string | null;
};

const homeUrl = "https://x.com/home";
const loginUrl = "https://x.com/login";
const loginWaitTimeoutMs = 10 * 60 * 1000;

export class PlaywrightSync {
	private readonly profileDirectory: string;
	private readonly captureDirectory: string;
	private context: BrowserContext | null = null;
	private page: Page | null = null;

	constructor({ profileDirectory, captureDirectory }: PlaywrightSyncOptions) {
		this.profileDirectory = profileDirectory;
		this.captureDirectory = captureDirectory;
	}

	async run(
		options: SyncCaptureOptions,
		onProgress: (progress: SyncProgress) => Promise<void> | void,
	): Promise<SyncRunResult> {
		await onProgress({
			phase: "launching-profile",
			message: "Opening a persistent Chromium profile for the X login session.",
			scannedCount: 0,
			importedCount: 0,
		});

		const page = await this.getPage();

		await onProgress({
			phase: "checking-session",
			message: "Checking whether an X session is already available.",
			scannedCount: 0,
			importedCount: 0,
		});

		if (await this.hasAuthenticatedSession(page)) {
			await page.goto(await this.resolveLikesTimelineUrl(page), {
				waitUntil: "domcontentloaded",
			});
		} else {
			await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

			await onProgress({
				phase: "awaiting-login",
				message:
					"Please sign in to X in the opened browser window. After login completes, the sync will continue automatically into your Likes timeline.",
				scannedCount: 0,
				importedCount: 0,
			});

			await this.waitForAuthenticatedSession(page);
			await page.goto(await this.resolveLikesTimelineUrl(page), {
				waitUntil: "domcontentloaded",
			});
		}

		await onProgress({
			phase: "capturing-likes",
			message: `Session detected. Capturing up to ${options.maxTweets} liked tweets from the Playwright profile.`,
			scannedCount: 0,
			importedCount: 0,
		});

		const probeResult = await this.captureLikesProbe(page, options.maxTweets);

		const result = {
			phase: "completed" as const,
			message: probeResult.artifactPath
				? `Saved ${probeResult.capturedResponseCount} raw Likes responses for up to ${options.maxTweets} tweets to ${probeResult.artifactPath}.`
				: "Login session is ready, but no raw Likes responses were captured yet.",
			scannedCount: probeResult.visibleTweetCount,
			importedCount: 0,
			artifactPath: probeResult.artifactPath,
		};

		await this.dispose();

		return result;
	}

	async dispose() {
		this.page = null;

		if (this.context) {
			await this.context.close();
			this.context = null;
		}
	}

	private async getPage() {
		if (!this.context) {
			mkdirSync(this.profileDirectory, { recursive: true });

			this.context = await chromium.launchPersistentContext(
				this.profileDirectory,
				{
					channel: "chrome",
					headless: false,
					ignoreDefaultArgs: ["--enable-automation"],
					args: ["--disable-blink-features=AutomationControlled"],
					viewport: { width: 1440, height: 960 },
				},
			);
		}

		if (this.page && !this.page.isClosed()) {
			return this.page;
		}

		this.page = this.context.pages()[0] ?? (await this.context.newPage());
		this.attachPageDiagnostics(this.page);
		return this.page;
	}

	private async captureLikesProbe(
		page: Page,
		maxTweets: number,
	): Promise<ProbeResult> {
		const capturedResponses: CapturedResponse[] = [];
		const seenResponseKeys = new Set<string>();
		const responseHandler = async (
			response: Awaited<ReturnType<Page["waitForResponse"]>>,
		) => {
			if (!this.isCandidateLikesResponse(response.url())) {
				return;
			}

			const contentType = response.headers()["content-type"] ?? "";

			if (!contentType.includes("application/json")) {
				return;
			}

			try {
				const body = await response.text();
				const responseKey = `${response.url()}::${response.status()}::${body.length}`;

				if (seenResponseKeys.has(responseKey)) {
					return;
				}

				seenResponseKeys.add(responseKey);

				capturedResponses.push({
					url: response.url(),
					status: response.status(),
					contentType,
					body,
				});
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Unknown response read failure";
				console.error(
					`[sync] could not read likes response ${response.url()}: ${message}`,
				);
			}
		};

		page.on("response", responseHandler);

		try {
			await page.goto(await this.resolveLikesTimelineUrl(page), {
				waitUntil: "domcontentloaded",
			});
			await page.waitForTimeout(2500);

			let roundsWithoutNewResponses = 0;
			const maxScrollRounds = Math.max(8, Math.ceil(maxTweets / 20) * 8);

			for (let round = 0; round < maxScrollRounds; round += 1) {
				const likesResponsesBeforeScroll =
					this.countLikesTimelineResponses(capturedResponses);
				const capturedTweetCountBeforeScroll =
					this.countCapturedTweetIds(capturedResponses);
				const visibleTweetCount = await this.countVisibleTweets(page);

				if (
					Math.max(visibleTweetCount, capturedTweetCountBeforeScroll) >=
					maxTweets
				) {
					break;
				}

				await page
					.locator('article[data-testid="tweet"]')
					.last()
					.scrollIntoViewIfNeeded()
					.catch(() => undefined);
				await page.mouse.wheel(0, 2400);
				await page.keyboard.press("End").catch(() => undefined);
				await page.waitForTimeout(2500);

				const likesResponsesAfterScroll =
					this.countLikesTimelineResponses(capturedResponses);
				const capturedTweetCountAfterScroll =
					this.countCapturedTweetIds(capturedResponses);

				if (
					likesResponsesAfterScroll > likesResponsesBeforeScroll ||
					capturedTweetCountAfterScroll > capturedTweetCountBeforeScroll
				) {
					roundsWithoutNewResponses = 0;
				} else {
					roundsWithoutNewResponses += 1;

					if (roundsWithoutNewResponses >= 6) {
						break;
					}
				}
			}
		} finally {
			page.off("response", responseHandler);
		}

		const visibleTweetCount = await this.countVisibleTweets(page);
		const artifactPath = this.writeCapturedResponses(capturedResponses);

		return {
			visibleTweetCount,
			capturedResponseCount: capturedResponses.length,
			artifactPath,
		};
	}

	private attachPageDiagnostics(page: Page) {
		if (
			(page as Page & { __tlmDiagnosticsAttached?: boolean })
				.__tlmDiagnosticsAttached
		) {
			return;
		}

		(
			page as Page & { __tlmDiagnosticsAttached?: boolean }
		).__tlmDiagnosticsAttached = true;

		page.on("framenavigated", (frame) => {
			if (frame === page.mainFrame()) {
				console.log(`[sync] browser navigated: ${frame.url()}`);
			}
		});

		page.on("pageerror", (error) => {
			console.error(`[sync] browser page error: ${error.message}`);
		});

		page.on("requestfailed", (request) => {
			const failure = request.failure();
			console.error(
				`[sync] request failed: ${request.method()} ${request.url()}${
					failure?.errorText ? ` (${failure.errorText})` : ""
				}`,
			);
		});

		page.on("console", (message) => {
			if (message.type() === "error" || message.type() === "warning") {
				console.log(
					`[sync] browser console ${message.type()}: ${message.text()}`,
				);
			}
		});
	}

	private async hasAuthenticatedSession(page: Page) {
		const cookies = await page.context().cookies("https://x.com");
		return cookies.some((cookie) => cookie.name === "auth_token");
	}

	private async resolveLikesTimelineUrl(page: Page) {
		await page.goto(homeUrl, { waitUntil: "domcontentloaded" });

		const profileLink = page
			.locator('a[data-testid="AppTabBar_Profile_Link"]')
			.first();

		try {
			await profileLink.waitFor({ state: "attached", timeout: 10000 });
			const href = await profileLink.getAttribute("href");

			if (href?.startsWith("/")) {
				return new URL(
					`${href.replace(/\/$/, "")}/likes`,
					"https://x.com",
				).toString();
			}
		} catch {
			// Fall through to a safer generic destination if the profile link cannot be resolved.
		}

		return homeUrl;
	}

	private isCandidateLikesResponse(url: string) {
		return (
			url.includes("/i/api/graphql/") ||
			url.includes("/i/api/2/") ||
			url.includes("/i/api/1.1/")
		);
	}

	private countLikesTimelineResponses(capturedResponses: CapturedResponse[]) {
		return capturedResponses.filter((response) =>
			response.url.includes("/Likes?"),
		).length;
	}

	private countCapturedTweetIds(capturedResponses: CapturedResponse[]) {
		const tweetIds = new Set<string>();

		for (const response of capturedResponses) {
			if (!response.url.includes("/Likes?")) {
				continue;
			}

			try {
				const body = JSON.parse(response.body) as {
					data?: {
						user?: {
							result?: {
								timeline?: {
									timeline?: {
										instructions?: Array<{
											entries?: Array<{ entryId?: string }>;
										}>;
									};
								};
							};
						};
					};
				};
				const entries =
					body.data?.user?.result?.timeline?.timeline?.instructions?.flatMap(
						(instruction) => instruction.entries ?? [],
					) ?? [];

				for (const entry of entries) {
					const entryId = entry.entryId ?? "";

					if (entryId.startsWith("tweet-")) {
						tweetIds.add(entryId.slice("tweet-".length));
					}
				}
			} catch {}
		}

		return tweetIds.size;
	}

	private writeCapturedResponses(capturedResponses: CapturedResponse[]) {
		if (capturedResponses.length === 0) {
			return null;
		}

		const runDirectory = path.join(
			this.captureDirectory,
			new Date().toISOString().replaceAll(":", "-"),
		);

		mkdirSync(runDirectory, { recursive: true });

		const artifactPath = path.join(runDirectory, "likes-responses.json");

		writeFileSync(
			artifactPath,
			JSON.stringify(
				{
					capturedAt: new Date().toISOString(),
					responseCount: capturedResponses.length,
					responses: capturedResponses,
				},
				null,
				2,
			),
			"utf8",
		);

		return artifactPath;
	}

	private async waitForAuthenticatedSession(page: Page) {
		const startedAt = Date.now();

		while (Date.now() - startedAt < loginWaitTimeoutMs) {
			if (await this.hasAuthenticatedSession(page)) {
				return;
			}

			await page.waitForTimeout(1500);
		}

		throw new Error("Timed out waiting for an authenticated X session.");
	}

	private async countVisibleTweets(page: Page) {
		const articles = page.locator('article[data-testid="tweet"]');

		try {
			await articles.first().waitFor({ timeout: 8000 });
		} catch {
			return 0;
		}

		return articles.count();
	}
}
