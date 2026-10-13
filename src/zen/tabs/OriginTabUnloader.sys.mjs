/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Unloads tabs that sat in the background for origin.tabs.unload-after-minutes,
// and after origin.memory.trim-after-idle-minutes without user input, or with
// another app in front, sends one memory-pressure notification so WebRender and
// the content processes drop their caches (docs/research/gpu-memory-2026-10-13.md,
// candidate 1). WebRender only evicts while it draws, so an idle browser otherwise
// keeps its peak caches.
// One timer for the whole app. Each window's ZenPreloadedScripts.js calls init(),
// and only the first call starts it.

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  TabUnloader: "moz-src:///browser/components/tabbrowser/TabUnloader.sys.mjs",
  webrtcUI: "resource:///modules/webrtcUI.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "idleService",
  "@mozilla.org/widget/useridleservice;1",
  Ci.nsIUserIdleService
);

const TICK_MS = 60 * 1000;

export const OriginTabUnloader = {
  _timer: null,
  _busy: false,
  // Tabs Firefox refused to unload (private, WebRTC, beforeunload handler),
  // mapped to their lastAccessed. They are skipped until the user visits them again,
  // so a refused tab does not make every tick pay for TabUnloader.getSortedTabs.
  _refused: new WeakMap(),
  // Background time counts from this at the earliest, so tabs restored with an old
  // lastAccessed wait the full delay after launch. Set in init(), near startup.
  _sessionStart: 0,
  // Date.now() of the last trim. The next trim waits for input after this.
  _trimmedAt: 0,
  // Date.now() when a tick first found no Origin window active, 0 while one is.
  _inactiveSince: 0,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._sessionStart = Date.now();
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_minutes",
      "origin.tabs.unload-after-minutes",
      10,
      () => this._schedule()
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_unloadEssentials",
      "origin.tabs.unload-essentials",
      false
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_trimMinutes",
      "origin.memory.trim-after-idle-minutes",
      0,
      () => this._schedule()
    );
    this._schedule();
  },

  _schedule() {
    this._timer?.cancel();
    this._timer = null;
    if (this._minutes > 0 || this._trimMinutes > 0) {
      this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      this._timer.initWithCallback(
        () => this._tick(),
        TICK_MS,
        Ci.nsITimer.TYPE_REPEATING_SLACK_LOW_PRIORITY
      );
    }
  },

  // Origin's own rules. Firefox's (private, PiP, sound, WebRTC, undiscardable,
  // dialogs, beforeunload) come from TabUnloader and discardBrowser below.
  _qualifies(tab, now, idleMs) {
    const browser = tab.linkedBrowser;
    if (
      tab.selected ||
      tab.closing ||
      !tab.linkedPanel ||
      !browser?.isConnected ||
      tab.hasAttribute("pending") ||
      tab.hasAttribute("zen-empty-tab") ||
      // Shown in a Zen split view (ZenViewSplitter.setTabsDocShellState).
      browser.zenModeActive ||
      tab.splitview?.hasActiveTab ||
      now - Math.max(tab.lastAccessed, this._sessionStart) < idleMs
    ) {
      return false;
    }
    if (
      !this._unloadEssentials &&
      (tab.pinned || tab.hasAttribute("zen-essential"))
    ) {
      return false;
    }
    if (this._playsMedia(tab)) {
      return false;
    }
    return this._refused.get(tab) !== tab.lastAccessed;
  },

  // Media that plays, or is paused but still controllable.
  _playsMedia(tab) {
    return (
      tab.soundPlaying ||
      !!tab.linkedBrowser?.browsingContext?.mediaController?.isActive
    );
  },

  async _tick() {
    // Unload first, so the trim also drops what the unloaded tabs left behind.
    await this.unloadIdleTabs();
    this.trimIfIdle();
  },

  // Milliseconds since the last user input, system wide. Tests replace this.
  _userIdleMs() {
    return lazy.idleService.idleTime;
  },

  // Milliseconds since a tick first found no Origin window active, so another app
  // is in front. A hidden window keeps the caches a trim drops until it shows again.
  // ponytail: measured on the minute tick, so up to a minute late; listen for
  // activate events if the trim needs to be exact. Tests replace this.
  _inactiveMs(now) {
    if (Services.focus.activeWindow) {
      this._inactiveSince = 0;
      return 0;
    }
    this._inactiveSince ||= now;
    return now - this._inactiveSince;
  },

  trimIfIdle() {
    if (this._trimMinutes <= 0 || Services.startup.shuttingDown) {
      return;
    }
    const now = Date.now();
    const idleMs = Math.max(this._userIdleMs(), this._inactiveMs(now));
    // Away since the last trim, the caches are still small.
    if (idleMs < this._trimMinutes * 60 * 1000 || now - idleMs < this._trimmedAt) {
      return;
    }
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      let tabs;
      try {
        tabs = win.gZenWorkspaces.allStoredTabs; // every space, not just the current one
      } catch {
        tabs = win.gBrowser?.tabs ?? []; // window still starting up
      }
      for (const tab of tabs) {
        const browser = tab.linkedBrowser;
        // A trim forces a full redraw, which a video or call would show as a hitch.
        // The WebRTC check is the one Firefox's TabUnloader uses (usingWebRTC).
        if (
          this._playsMedia(tab) ||
          (browser &&
            (lazy.webrtcUI.browserHasStreams(browser) ||
              browser.browsingContext?.currentWindowGlobal?.hasActivePeerConnections()))
        ) {
          return;
        }
      }
    }
    this._trimmedAt = now;
    Services.obs.notifyObservers(null, "memory-pressure", "heap-minimize");
  },

  async unloadIdleTabs() {
    if (this._busy || this._minutes <= 0 || Services.startup.shuttingDown) {
      return;
    }
    const idleMs = this._minutes * 60 * 1000;
    const now = Date.now();
    const candidates = new Set();
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      let tabs;
      try {
        tabs = win.gZenWorkspaces.allStoredTabs;
      } catch {
        continue; // window still starting up
      }
      for (const tab of tabs) {
        if (this._qualifies(tab, now, idleMs)) {
          candidates.add(tab);
        }
      }
    }
    if (!candidates.size) {
      return;
    }

    this._busy = true;
    try {
      const sorted = await lazy.TabUnloader.getSortedTabs(idleMs);
      for (const info of sorted) {
        const { tab, gBrowser } = info;
        if (!candidates.has(tab)) {
          continue;
        }
        if (!lazy.TabUnloader.isDiscardable(info)) {
          this._refused.set(tab, tab.lastAccessed);
          continue;
        }
        // Flush history, scroll position and form data to session store first.
        await gBrowser.prepareDiscardBrowser(tab);
        // The user may have switched to it or started media during the flush.
        if (!this._qualifies(tab, Date.now(), idleMs)) {
          continue;
        }
        if (!gBrowser.discardBrowser(tab)) {
          this._refused.set(tab, tab.lastAccessed);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      this._busy = false;
    }
  },
};
