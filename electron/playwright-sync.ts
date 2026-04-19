import { mkdirSync } from "node:fs"

import {
  chromium,
  type BrowserContext,
  type Page,
} from "playwright"

import type { SyncPhase } from "../src/types/desktop"

type SyncProgress = {
  phase: SyncPhase
  message: string
  scannedCount: number
  importedCount: number
}

type PlaywrightSyncOptions = {
  profileDirectory: string
}

const likesTimelineUrl = "https://x.com/i/likes"
const loginUrl = "https://x.com/login"
const loginWaitTimeoutMs = 10 * 60 * 1000

export class PlaywrightSync {
  private readonly profileDirectory: string
  private context: BrowserContext | null = null
  private page: Page | null = null

  constructor({ profileDirectory }: PlaywrightSyncOptions) {
    this.profileDirectory = profileDirectory
  }

  async run(
    onProgress: (progress: SyncProgress) => Promise<void> | void
  ): Promise<SyncProgress> {
    await onProgress({
      phase: "launching-profile",
      message:
        "Opening a persistent Chromium profile for the X login session.",
      scannedCount: 0,
      importedCount: 0,
    })

    const page = await this.getPage()

    await onProgress({
      phase: "checking-session",
      message: "Checking whether an X session is already available.",
      scannedCount: 0,
      importedCount: 0,
    })

    if (await this.hasAuthenticatedSession(page)) {
      await page.goto(likesTimelineUrl, { waitUntil: "domcontentloaded" })
    } else {
      await page.goto(loginUrl, { waitUntil: "domcontentloaded" })

      await onProgress({
        phase: "awaiting-login",
        message:
          "Please sign in to X in the opened browser window. After login completes, the sync will continue automatically into your Likes timeline.",
        scannedCount: 0,
        importedCount: 0,
      })

      await this.waitForAuthenticatedSession(page)
      await page.goto(likesTimelineUrl, { waitUntil: "domcontentloaded" })
    }

    await onProgress({
      phase: "capturing-likes",
      message:
        "Session detected. Inspecting the visible Likes timeline in the Playwright profile.",
      scannedCount: 0,
      importedCount: 0,
    })

    const visibleTweetCount = await this.countVisibleTweets(page)

    const result = {
      phase: "completed" as const,
      message:
        "Login session is ready. The next slice will replace this probe with real likes capture and normalization.",
      scannedCount: visibleTweetCount,
      importedCount: 0,
    }

    await this.dispose()

    return result
  }

  async dispose() {
    this.page = null

    if (this.context) {
      await this.context.close()
      this.context = null
    }
  }

  private async getPage() {
    if (!this.context) {
      mkdirSync(this.profileDirectory, { recursive: true })

      this.context = await chromium.launchPersistentContext(
        this.profileDirectory,
        {
          channel: "chrome",
          headless: false,
          ignoreDefaultArgs: ["--enable-automation"],
          args: ["--disable-blink-features=AutomationControlled"],
          viewport: { width: 1440, height: 960 },
        }
      )
    }

    if (this.page && !this.page.isClosed()) {
      return this.page
    }

    this.page = this.context.pages()[0] ?? (await this.context.newPage())
    this.attachPageDiagnostics(this.page)
    return this.page
  }

  private attachPageDiagnostics(page: Page) {
    if ((page as Page & { __tlmDiagnosticsAttached?: boolean }).__tlmDiagnosticsAttached) {
      return
    }

    ;(page as Page & { __tlmDiagnosticsAttached?: boolean }).__tlmDiagnosticsAttached = true

    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        console.log(`[sync] browser navigated: ${frame.url()}`)
      }
    })

    page.on("pageerror", (error) => {
      console.error(`[sync] browser page error: ${error.message}`)
    })

    page.on("requestfailed", (request) => {
      const failure = request.failure()
      console.error(
        `[sync] request failed: ${request.method()} ${request.url()}${
          failure?.errorText ? ` (${failure.errorText})` : ""
        }`
      )
    })

    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        console.log(`[sync] browser console ${message.type()}: ${message.text()}`)
      }
    })
  }

  private async hasAuthenticatedSession(page: Page) {
    const cookies = await page.context().cookies("https://x.com")
    return cookies.some((cookie) => cookie.name === "auth_token")
  }

  private async waitForAuthenticatedSession(page: Page) {
    const startedAt = Date.now()

    while (Date.now() - startedAt < loginWaitTimeoutMs) {
      if (await this.hasAuthenticatedSession(page)) {
        return
      }

      await page.waitForTimeout(1500)
    }

    throw new Error("Timed out waiting for an authenticated X session.")
  }

  private async countVisibleTweets(page: Page) {
    const articles = page.locator('article[data-testid="tweet"]')

    try {
      await articles.first().waitFor({ timeout: 8000 })
    } catch {
      return 0
    }

    return articles.count()
  }
}