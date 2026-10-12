/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Unloads tabs that sat in the background for origin.tabs.unload-after-minutes.
// One timer for the whole app. Each window's ZenPreloadedScripts.js calls init(),
// and only the first call starts it.

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  TabUnloader: "moz-src:///browser/components/tabbrowser/TabUnloader.sys.mjs",
});

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
    this._schedule();
  },

  _schedule() {
    this._timer?.cancel();
    this._timer = null;
    if (this._minutes > 0) {
      this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      this._timer.initWithCallback(
        () => this.unloadIdleTabs(),
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
    // Media that plays, or is paused but still controllable.
    if (tab.soundPlaying || browser.browsingContext?.mediaController?.isActive) {
      return false;
    }
    return this._refused.get(tab) !== tab.lastAccessed;
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
