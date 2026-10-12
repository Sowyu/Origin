// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { playWindowSweepAnimation } from "chrome://browser/content/ZenUpdates.mjs";

class ZenStartup {
  #hasInitializedLayout = false;

  isReady = false;
  promiseInitialized = new Promise(resolve => {
    this.promiseInitializedResolve = resolve;
  });

  init() {
    this.#zenInitBrowserLayout();
  }

  #zenInitBrowserLayout() {
    if (this.#hasInitializedLayout) {
      return;
    }
    this.#hasInitializedLayout = true;
    gZenKeyboardShortcutsManager.beforeInit();
    try {
      const kNavbarItems = ["nav-bar", "PersonalToolbar"];
      const kNewContainerId = "zen-appcontent-navbar-container";
      let newContainer = document.getElementById(kNewContainerId);
      for (let id of kNavbarItems) {
        const node = document.getElementById(id);
        if (!node) {
          console.error("Could not find node with id: " + id);
          continue;
        }
        newContainer.appendChild(node);
      }
      // Fix notification deck
      const deckTemplate =
        document.getElementById("tab-notification-deck-template") ||
        document.getElementById("tab-notification-deck");

      // overlap and interaction issues with vertical tabs
      document.getElementById("browser").prepend(deckTemplate);

      gZenWorkspaces.init().then(() => {
        gZenUIManager.init();
      });
    } catch (e) {
      console.error("ZenThemeModifier: Error initializing browser layout", e);
    }
    if (gBrowserInit.delayedStartupFinished) {
      this.delayedStartupFinished();
    } else {
      Services.obs.addObserver(this, "browser-delayed-startup-finished");
    }
  }

  observe(aSubject, aTopic) {
    // This nsIObserver method allows us to defer initialization until after
    // this window has finished painting and starting up.
    if (aTopic == "browser-delayed-startup-finished" && aSubject == window) {
      Services.obs.removeObserver(this, "browser-delayed-startup-finished");
      this.delayedStartupFinished();
    }
  }

  delayedStartupFinished() {
    gZenWorkspaces.promiseInitialized.then(async () => {
      await delayedStartupPromise;
      await SessionStore.promiseAllWindowsRestored;
      delete gZenUIManager.promiseInitialized;
      gZenCompactModeManager.init();
      // Fix for https://github.com/zen-browser/desktop/issues/7605, specially in compact mode
      if (gURLBar.hasAttribute("breakout-extend")) {
        gURLBar.focus();
      }
      // A bit of a hack to make sure the tabs toolbar is updated.
      // Just in case we didn't get the right size.
      gZenUIManager.updateTabsToolbar();
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new window.Event("resize")); // To recalculate the layout
      });
      document
        .getElementById("tabbrowser-arrowscrollbox")
        .setAttribute("orient", "vertical");
      this.isReady = true;
      this.promiseInitializedResolve();
      delete this.promiseInitializedResolve;
    });
  }

  /**
   * Entry point for privileged modules (e.g. the sync applier) to play the
   * update sweep animation in this window.
   */
  playWindowSweepAnimation() {
    return playWindowSweepAnimation();
  }
}

window.gZenStartup = new ZenStartup();

window.addEventListener(
  "MozBeforeInitialXULLayout",
  () => {
    gZenStartup.init();
  },
  { once: true }
);
