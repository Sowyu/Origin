// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { nsZenMultiWindowFeature } from "chrome://browser/content/zen-components/ZenCommonUtils.mjs";
import { nsZenMenuBar } from "chrome://browser/content/zen-components/ZenMenubar.mjs";
import { UrlbarShared } from "chrome://browser/content/urlbar/UrlbarShared.mjs";

window.gZenUIManager = {
  _popupTrackingElements: [],
  _hoverPausedForExpand: false,
  _hasLoadedDOM: false,
  testingEnabled: Services.prefs.getBoolPref("zen.testing.enabled", false),
  profilingEnabled: Services.prefs.getBoolPref(
    "zen.testing.profiling.enabled",
    false
  ),

  _lastClickPosition: null,

  _toastTimeouts: [],

  init() {
    window.gZenMenubar = new nsZenMenuBar();

    document.addEventListener("popupshowing", this.onPopupShowing.bind(this));
    document.addEventListener("popuphidden", this.onPopupHidden.bind(this));

    document.addEventListener(
      "mousedown",
      this.handleMouseDown.bind(this),
      true
    );

    ChromeUtils.defineLazyGetter(this, "_toastContainer", () => {
      return document.getElementById("zen-toast-container");
    });

    gZenWorkspaces.promiseInitialized.finally(() => {
      this._hasLoadedDOM = true;
      this.updateTabsToolbar();
    });

    window.addEventListener("TabClose", this.onTabClose.bind(this));
    window.addEventListener(
      "Zen:UrlbarSearchModeChanged",
      this.onUrlbarSearchModeChanged.bind(this)
    );

    gZenVerticalTabsManager.init();

    this._initCreateNewPopup();
    this._debloatContextMenus();
    this._addNewCustomizableButtonsIfNeeded();
    this._initOmnibox();
    this._initBookmarkCollapseListener();

    gURLBar._setPlaceholder(null);

    document
      .getElementById("PersonalToolbar")
      .setAttribute("fullscreentoolbar", "true");
  },

  /**
   * Motion's duration-based springs, sampled at 20 steps into linear(), keyed
   * by bounce. Their shape does not depend on the duration.
   */
  springEasings: {
    0: "linear(0, 0.079, 0.236, 0.403, 0.551, 0.671, 0.764, 0.833, 0.883, 0.919, 0.944, 0.962, 0.974, 0.983, 0.988, 0.992, 0.995, 0.997, 0.998, 0.998, 1)",
    0.2: "linear(0, 0.079, 0.249, 0.438, 0.609, 0.748, 0.852, 0.923, 0.969, 0.995, 1.009, 1.014, 1.015, 1.013, 1.01, 1.008, 1.005, 1.003, 1.002, 1.001, 1)",
    0.3: "linear(0, 0.096, 0.299, 0.521, 0.715, 0.861, 0.958, 1.014, 1.04, 1.046, 1.041, 1.032, 1.021, 1.013, 1.006, 1.002, 0.999, 0.998, 0.998, 0.998, 1)",
    0.4: "linear(0, 0.121, 0.374, 0.64, 0.856, 0.998, 1.072, 1.095, 1.086, 1.062, 1.037, 1.016, 1.001, 0.994, 0.991, 0.992, 0.994, 0.996, 0.998, 1, 1)",
  },

  /**
   * Runs element.animate() on one or more elements with the contract callers
   * had from Motion: the result is a thenable that resolves on finish or
   * cancel, complete() jumps to the end, and the last keyframe stays as inline
   * style, even on elements that are not rendered. Pass `fill: "none"` for a pulse that ends where it started, so no
   * inline style overrides the element's own :hover or :active rules.
   * Pseudo-element animations keep filling until the caller cancels them.
   * Animate only transform and opacity, so the compositor runs it.
   *
   * @param {Element|Iterable<Element>} elements
   * @param {object} keyframes Keyframes as element.animate() takes them.
   * @param {object} options element.animate() options in ms. `bounce` picks
   *   one of springEasings, `delay` may be a function of the element's index.
   */
  animate(elements, keyframes, { bounce, delay = 0, ...options } = {}) {
    elements = Element.isInstance(elements)
      ? [elements]
      : [...(elements ?? [])].filter(Boolean);
    // The end values to leave inline, like Motion did. Written by hand
    // because commitStyles() throws on elements that are not rendered.
    const last = Array.isArray(keyframes)
      ? { ...keyframes.at(-1) }
      : Object.fromEntries(
          Object.entries(keyframes).map(([name, value]) => [
            name,
            [value].flat().at(-1),
          ])
        );
    delete last.offset;
    delete last.easing;
    delete last.composite;
    const animations = elements.map((element, index) => {
      const animation = element.animate(keyframes, {
        easing: bounce === undefined ? "ease-out" : this.springEasings[bounce],
        fill: "forwards",
        ...options,
        delay: typeof delay === "function" ? delay(index) : delay,
        ...(gReduceMotion ? { duration: 0, delay: 0 } : {}),
      });
      if (
        animation.effect.getTiming().fill === "forwards" &&
        !options.pseudoElement
      ) {
        animation.finished.then(
          () => {
            for (const [name, value] of Object.entries(last)) {
              if (name.startsWith("--")) {
                element.style.setProperty(name, value);
              } else {
                element.style[name] = value;
              }
            }
            animation.cancel();
          },
          () => {}
        );
      }
      return animation;
    });
    const promise = Promise.all(
      animations.map(animation => animation.finished.catch(() => {}))
    );
    return {
      then: (onResolve, onReject) => promise.then(onResolve, onReject),
      // Skip animations that already ended and cancelled themselves, since
      // finish() would restart them and leave them filling for good.
      complete: () =>
        animations.forEach(animation => {
          if (animation.playState !== "idle") {
            animation.finish();
          }
        }),
      cancel: () => animations.forEach(animation => animation.cancel()),
    };
  },

  /**
   * Animate an element using Element.animate API.
   *
   * @param {Element} element
   * @param {object} rawKeyframes
   * @param {...any} args
   */
  async elementAnimate(element, rawKeyframes, ...args) {
    rawKeyframes = { ...rawKeyframes };
    // Convert 'y' property to 'transform' with translateY and 'x' to translateX,
    // and 'scale' to 'transform' with scale.
    if (
      (rawKeyframes.y || rawKeyframes.x || rawKeyframes.scale) &&
      !rawKeyframes.transform
    ) {
      const yValues = rawKeyframes.y || [];
      const xValues = rawKeyframes.x || [];
      const scaleYValues = rawKeyframes.scaleY || [];
      const scaleXValues = rawKeyframes.scaleX || [];
      delete rawKeyframes.y;
      delete rawKeyframes.x;
      delete rawKeyframes.scaleY;
      delete rawKeyframes.scaleX;
      rawKeyframes.transform = [];
      if (
        yValues.length !== 0 &&
        xValues.length !== 0 &&
        yValues.length !== xValues.length
      ) {
        console.error("y and x keyframes must have the same length");
      }
      const keyframeLength = Math.max(
        yValues.length,
        xValues.length,
        scaleYValues.length,
        scaleXValues.length
      );
      for (let i = 0; i < keyframeLength; i++) {
        const y = yValues[i] !== undefined ? `translateY(${yValues[i]}px)` : "";
        const x = xValues[i] !== undefined ? `translateX(${xValues[i]}px)` : "";
        const scaleY =
          scaleYValues[i] !== undefined ? `scaleY(${scaleYValues[i]})` : "";
        const scaleX =
          scaleXValues[i] !== undefined ? `scaleX(${scaleXValues[i]})` : "";
        rawKeyframes.transform.push(`${x} ${y} ${scaleX} ${scaleY}`.trim());
      }
    }
    let keyframes = [];
    for (let i = 0; i < Object.values(rawKeyframes)[0].length; i++) {
      let frame = {};
      for (const [property, values] of Object.entries(rawKeyframes)) {
        frame[property] = values[i];
      }
      keyframes.push(frame);
    }
    return await new Promise(resolve => {
      const animation = element.animate(keyframes, ...args);
      animation.onfinish = () => resolve();
    });
  },

  /**
   * Shakes an element from side to side to catch the user's eye.
   *
   * @param {Element} element
   * @param {number} delay Milliseconds to wait before shaking.
   */
  shakeElement(element, delay = 0) {
    return this.elementAnimate(
      element,
      { x: [0, -12, 8, -4, 2, 0] },
      { duration: 600, delay, easing: "ease-out" }
    );
  },

  _addNewCustomizableButtonsIfNeeded() {
    const kPref = "zen.ui.migration.compact-mode-button-added";
    let navbarPlacements = CustomizableUI.getWidgetIdsInArea(
      "zen-sidebar-top-buttons"
    );
    try {
      if (
        !navbarPlacements.length &&
        !Services.prefs.getBoolPref(kPref, false)
      ) {
        CustomizableUI.addWidgetToArea(
          "zen-toggle-compact-mode",
          "zen-sidebar-top-buttons",
          0
        );
        gZenVerticalTabsManager._topButtonsSeparatorElement.before(
          document.getElementById("zen-toggle-compact-mode")
        );
      }
    } catch (e) {
      console.error("Error adding compact mode button to sidebar:", e);
    }
    Services.prefs.setBoolPref(kPref, true);
  },

  _initBookmarkCollapseListener() {
    const bookmarkToolbar = document.getElementById("PersonalToolbar");
    if (!bookmarkToolbar.hasAttribute("collapsed")) {
      // Set it initially if bookmarks toolbar is visible, customizable UI
      // is ran before this function.
      document.documentElement.setAttribute("zen-has-bookmarks", "true");
    }
    bookmarkToolbar.addEventListener("toolbarvisibilitychange", event => {
      const visible = event.detail.visible;
      if (visible) {
        document.documentElement.setAttribute("zen-has-bookmarks", "true");
      } else {
        document.documentElement.removeAttribute("zen-has-bookmarks");
      }
    });
  },

  _initOmnibox() {
    const { nsZenSiteDataPanel: ZenSiteDataPanel } = ChromeUtils.importESModule(
      "resource:///modules/ZenSiteDataPanel.sys.mjs"
    );
    // Every urlbar query in this window goes through gURLBar.startQuery, so
    // register the providers right before the first one instead of at startup.
    // Deleting the own property restores the prototype method.
    gURLBar.startQuery = function (...args) {
      delete this.startQuery;
      const { registerZenUrlbarProviders } = ChromeUtils.importESModule(
        "resource:///modules/ZenUBProvider.sys.mjs"
      );
      registerZenUrlbarProviders();
      return this.startQuery(...args);
    };
    window.gZenSiteDataPanel = new ZenSiteDataPanel(window);
    gURLBar._zenTrimURL = this.urlbarTrim.bind(this);
  },

  _debloatContextMenus() {
    if (!Services.prefs.getBoolPref("zen.view.context-menu.refresh", false)) {
      return;
    }
    const contextMenusToClean = [
      // Remove the 'new tab below' context menu.
      // reason: It doesn't properly work with zen and it's philosophy of not having
      //   new tabs. It's also semi-not working as it doesn't create a new tab below
      //   the current one.
      "context_openANewTab",
    ];
    for (const id of contextMenusToClean) {
      const menu = document.getElementById(id);
      if (!menu) {
        continue;
      }
      menu.setAttribute("hidden", "true");
    }
  },

  _initCreateNewPopup() {
    const popup = document.getElementById("zenCreateNewPopup");

    popup.addEventListener("popupshowing", () => {
      const button = document.getElementById("zen-create-new-button");
      if (!button) {
        return;
      }
      const image = button.querySelector("image");
      button.setAttribute("open", "true");
      gZenUIManager.animate(
        image,
        { transform: ["rotate(0deg)", "rotate(45deg)"] },
        { duration: 200 }
      );
      popup.addEventListener(
        "popuphidden",
        () => {
          button.removeAttribute("open");
          gZenUIManager.animate(
            image,
            { transform: ["rotate(45deg)", "rotate(0deg)"] },
            { duration: 200 }
          );
        },
        { once: true }
      );
    });
  },

  handleMouseDown(event) {
    this._lastClickPosition = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
  },

  updateTabsToolbar(fromResizeEvent = false) {
    const kUrlbarHeight = 333;
    gURLBar.style.setProperty(
      "--zen-urlbar-top",
      `${window.innerHeight / 2 - Math.max(kUrlbarHeight, window.windowUtils.getBoundsWithoutFlushing(gURLBar).height) / 2}px`
    );
    gURLBar.style.setProperty(
      "--zen-urlbar-width",
      `${Math.min(window.innerWidth / 1.5, 750)}px`
    );
    gZenVerticalTabsManager.actualWindowButtons.removeAttribute(
      "zen-has-hover"
    );
    gZenVerticalTabsManager.recalculateURLBarHeight(!fromResizeEvent);
    if (!this._preventToolbarRebuild && !fromResizeEvent) {
      setTimeout(() => {
        gZenWorkspaces.updateTabsContainers();
      }, 0);
    }
    delete this._preventToolbarRebuild;
  },

  get tabsWrapper() {
    if (this._tabsWrapper) {
      return this._tabsWrapper;
    }
    this._tabsWrapper = document.getElementById("zen-tabs-wrapper");
    return this._tabsWrapper;
  },

  onTabClose(event = undefined) {
    if (!event?.target?._closedInMultiselection) {
      this.updateTabsToolbar();
    }
  },

  onFloatingURLBarOpen() {
    requestAnimationFrame(() => {
      this.updateTabsToolbar();
    });
  },

  openAndChangeToTab(url, options) {
    if (window.parent) {
      const tab = window.parent.gBrowser.addTrustedTab(url, options);
      window.parent.gBrowser.selectedTab = tab;
      return tab;
    }
    const tab = window.gBrowser.addTrustedTab(url, options);
    window.gBrowser.selectedTab = tab;
    return tab;
  },

  generateUuidv4() {
    return Services.uuid.generateUUID().toString();
  },

  createValidXULText(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  },

  /**
   * Adds the 'has-popup-menu' attribute to the element when popup is opened on it.
   *
   * @param {Element} element element to track
   */
  addPopupTrackingAttribute(element) {
    this._popupTrackingElements.push(element);
  },

  removePopupTrackingAttribute(element) {
    this._popupTrackingElements.remove(element);
  },

  // On macOS, the app menu panel is displayed as a native NSPopover which
  // silently clips content beyond the screen without informing Firefox's
  // layout engine. This makes bottom menu items unreachable by scrolling.
  // Setting max-height based on available screen space lets Firefox's layout
  // handle the constraint, enabling proper overflow scrolling.
  // See gh-12782
  _constrainNativePopoverHeight(panel) {
    const panelIds = [
      "appMenu-popup",
      "customizationui-widget-panel",
      "widget-overflow",
    ];
    if (!panelIds.includes(panel.id)) {
      return;
    }
    // NSPopover adds 13px of chrome on all sides (26px vertical total),
    // measured via Accessibility Inspector on macOS 26 (Tahoe).
    // Previous macOS versions have similar or smaller values, so this is a
    // conservative upper bound.
    const popoverChrome = 26;
    const maxHeight = window.screen.availHeight - popoverChrome;
    panel.style.maxHeight = `${maxHeight}px`;
  },

  onPopupShowing(showEvent) {
    if (
      AppConstants.platform === "macosx" &&
      Services.prefs.getBoolPref("widget.macos.native-context-menus", false)
    ) {
      this._constrainNativePopoverHeight(showEvent.target);
    }
    for (const el of this._popupTrackingElements) {
      // target may be inside a shadow root, not directly under the element
      // we also ignore menus inside panels
      if (
        !el.contains(showEvent.explicitOriginalTarget) ||
        (Element.isInstance(showEvent.explicitOriginalTarget) &&
          showEvent.explicitOriginalTarget?.closest("panel")) ||
        // See bug #7590: Ignore menupopup elements opening.
        // Also see #10612 for the exclusion of the zen-appcontent-navbar-wrapper
        (showEvent.explicitOriginalTarget.tagName === "menupopup" &&
          el.id !== "zen-appcontent-navbar-wrapper")
      ) {
        continue;
      }
      document.removeEventListener("mousemove", this.__removeHasPopupAttribute);
      gZenCompactModeManager._setElementExpandAttribute(
        el,
        true,
        "has-popup-menu"
      );
      this.__currentPopup = showEvent.target;
      this.__currentPopupTrackElement = el;
      break;
    }
  },

  onPopupHidden(hideEvent) {
    if (!this.__currentPopup || this.__currentPopup !== hideEvent.target) {
      return;
    }
    const element = this.__currentPopupTrackElement;
    if (document.getElementById("main-window").matches(":hover")) {
      gZenCompactModeManager._setElementExpandAttribute(
        element,
        false,
        "has-popup-menu"
      );
    } else {
      this.__removeHasPopupAttribute = () =>
        gZenCompactModeManager._setElementExpandAttribute(
          element,
          false,
          "has-popup-menu"
        );
      document.addEventListener("mousemove", this.__removeHasPopupAttribute, {
        once: true,
      });
    }
    this.__currentPopup = null;
    this.__currentPopupTrackElement = null;
  },

  // Section: URL bar

  onUrlbarOpen() {
    setTimeout(() => {
      const hadValid = gURLBar.getAttribute("pageproxystate") === "valid";
      gURLBar.setPageProxyState("invalid", false);
      gURLBar.setAttribute("had-proxystate", hadValid);
    }, 0);
  },

  onUrlbarClose() {
    if (gURLBar.getAttribute("had-proxystate") == "true") {
      gURLBar.setPageProxyState("valid", false);
    }
    gURLBar.removeAttribute("had-proxystate");
  },

  onUrlbarSearchModeChanged(event) {
    if (gReduceMotion) {
      return;
    }
    const { searchMode } = event.detail;
    const input = gURLBar;
    if (gURLBar.hasAttribute("breakout-extend") && !this._animatingSearchMode) {
      this._animatingSearchMode = true;
      this.animate(
        input,
        { scale: [1, 0.98, 1] },
        { duration: 250, fill: "none" }
      ).then(() => {
        delete this._animatingSearchMode;
      });
      if (searchMode) {
        gURLBar.setAttribute("animate-searchmode", "true");
        this._animatingSearchModeTimeout = setTimeout(() => {
          requestAnimationFrame(() => {
            gURLBar.removeAttribute("animate-searchmode");
            delete this._animatingSearchModeTimeout;
          });
        }, 1000);
      }
    }
  },

  enableCommandsMode(event) {
    event.preventDefault();
    if (!gURLBar.hasAttribute("breakout-extend") || this._animatingSearchMode) {
      return;
    }
    const currentSearchMode = gURLBar.getSearchMode(gBrowser.selectedBrowser);
    let searchMode = null;
    if (!currentSearchMode) {
      searchMode = {
        source: UrlbarShared.RESULT_SOURCE.ZEN_ACTIONS,
        isPreview: true,
      };
    }
    gURLBar.removeAttribute("animate-searchmode");
    if (this._animatingSearchModeTimeout) {
      clearTimeout(this._animatingSearchModeTimeout);
      delete this._animatingSearchModeTimeout;
    }
    gURLBar.searchMode = searchMode;
    gURLBar.startQuery({
      allowAutofill: false,
      event,
    });
  },

  get newtabButtons() {
    return document.querySelectorAll("#tabs-newtab-button");
  },

  _prevUrlbarLabel: null,
  _lastSearch: "",
  _clearTimeout: null,
  _lastTab: null,

  _urlbarSessionCounter: 0,
  _urlbarOwner: null,

  _isOwner(closeSeq) {
    return this._urlbarOwner === closeSeq;
  },

  handleNewTab(
    werePassedURL,
    searchClipboard,
    where,
    overridePreferance = false,
    closeToken = {}
  ) {
    // Keep this here. It's better to make sure every
    // call has a different token rather then forgetting
    // to increment it in one of the early returns.
    const closeSeq = ++this._urlbarSessionCounter;
    closeToken.id = closeSeq;

    if (this.testingEnabled && !overridePreferance) {
      return false;
    }

    const shouldOpenURLBar =
      overridePreferance ||
      (gZenVerticalTabsManager._canReplaceNewTab &&
        !werePassedURL &&
        !searchClipboard &&
        where === "tab");

    if (!shouldOpenURLBar) {
      return false;
    }

    // Close the new tab popup on cmd/ctrl + t
    if (!overridePreferance && gURLBar.hasAttribute("zen-newtab")) {
      // The _zenHandleUrlbarClose holds a token in it's closure.
      // Call that instead.
      if (gURLBar._zenHandleUrlbarClose) {
        gURLBar._zenHandleUrlbarClose();
      } else {
        this.handleUrlbarClose(closeSeq);
      }
      return true;
    }

    // Clear any existing timeout
    if (this._clearTimeout) {
      clearTimeout(this._clearTimeout);
      this._clearTimeout = null;
    }

    // Store the current tab
    this._lastTab = gBrowser.selectedTab;
    if (!this._lastTab) {
      console.warn("No selected tab found when creating new tab");
      return false;
    }

    // Set visual state with proper validation
    if (this._lastTab && !this._lastTab.closing) {
      this._lastTab._visuallySelected = false;
    }

    // Store URL bar state
    this._prevUrlbarLabel = gURLBar._untrimmedValue || "";

    // Set up URL bar for new tab
    gURLBar._zenHandleUrlbarClose = (onSwitch, onElementPicked) =>
      this.handleUrlbarClose(closeSeq, onSwitch, onElementPicked);
    this._urlbarOwner = closeSeq;
    gURLBar.setAttribute("zen-newtab", true);

    // Update newtab buttons
    for (const button of this.newtabButtons) {
      button.setAttribute("in-urlbar", true);
    }

    // Open location command
    try {
      gURLBar.search(this._lastSearch || "");
      document.getElementById("Browser:OpenLocation").doCommand();
    } catch (e) {
      console.error("Error opening location in new tab:", e);
      this.handleUrlbarClose(closeSeq, false, false);
      return false;
    }
    return true;
  },

  /**
   * Check whether the closeToken given by handleNewTab
   * corresponds to a close event.
   *
   * @param {object} closeToken - Token previously passed to handleNewTab.
   * @param {CustomEvent} event - A ZenURLBarClosed event.
   * @returns {boolean}
   */
  matchesCloseToken(closeToken, event) {
    return (
      typeof closeToken?.id === "number" &&
      event?.detail?.closeSeq === closeToken.id
    );
  },

  clearUrlbarData() {
    this._prevUrlbarLabel = null;
    this._lastSearch = "";
  },

  handleUrlbarClose(closeSeq, onSwitch = false, onElementPicked = false) {
    // Reset URL bar state
    if (gURLBar._zenHandleUrlbarClose) {
      gURLBar._zenHandleUrlbarClose = null;
    }

    const isFocusedBefore = gURLBar.focused;
    setTimeout(() => {
      /* If someone else opened the url bar in the meantime don't be
       * stingy and leave it open for them.*/
      if (this._isOwner(closeSeq)) {
        // We use this attribute on Tabbrowser::addTab
        gURLBar.removeAttribute("zen-newtab");

        // Safely restore tab visual state with proper validation
        if (
          this._lastTab &&
          !this._lastTab.closing &&
          this._lastTab.documentGlobal &&
          !this._lastTab.documentGlobal.closed &&
          gBrowser.selectedTab === this._lastTab
        ) {
          this._lastTab._visuallySelected = true;
          this._lastTab = null;
        }

        // Reset newtab buttons
        for (const button of this.newtabButtons) {
          button.removeAttribute("in-urlbar");
        }

        // Handle search data
        if (onSwitch) {
          this.clearUrlbarData();
        } else {
          this._lastSearch = gURLBar._untrimmedValue || "";

          if (this._clearTimeout) {
            clearTimeout(this._clearTimeout);
          }

          this._clearTimeout = setTimeout(() => {
            this.clearUrlbarData();
          }, this.urlbarWaitToClear);
        }

        // Safely restore URL bar state with proper validation
        if (this._prevUrlbarLabel) {
          gURLBar.setURI({
            uri: this._prevUrlbarLabel,
            dueToTabSwitch: onSwitch,
            isSameDocument: !onSwitch,
          });
        }

        gURLBar.handleRevert();
      }

      if (isFocusedBefore) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("ZenURLBarClosed", {
              detail: { onSwitch, onElementPicked, closeSeq },
            })
          );

          if (!this._isOwner(closeSeq)) {
            return;
          }
          this._urlbarOwner = null;

          gURLBar.view.close({ elementPicked: onElementPicked });
          gURLBar.updateTextOverflow();

          if (onElementPicked && onSwitch) {
            gURLBar.setURI({ dueToTabSwitch: onSwitch });
          }

          // Ensure tab and browser are valid before updating state
          const selectedTab = gBrowser.selectedTab;
          if (
            selectedTab &&
            selectedTab.linkedBrowser &&
            !selectedTab.closing &&
            onSwitch
          ) {
            const browserState = gURLBar.getBrowserState(
              selectedTab.linkedBrowser
            );
            if (browserState) {
              browserState.urlbarFocused = false;
            }
          }
        }, 0);
      } else if (this._isOwner(closeSeq)) {
        this._urlbarOwner = null;
      }
    }, 0);
  },

  urlbarTrim(aURL) {
    if (gURLBar.hasAttribute("breakout-extend")) {
      return aURL;
    }
    if (
      gZenVerticalTabsManager._hasSetSingleToolbar &&
      this.urlbarShowDomainOnly
    ) {
      let url = BrowserUIUtils.removeSingleTrailingSlashFromURL(aURL);
      let stripped = url.startsWith("https://") ? url.split("/")[2] : url;
      if (stripped.startsWith("www.")) {
        stripped = stripped.substring(4);
      }
      return stripped;
    }
    return BrowserUIUtils.trimURL(aURL);
  },

  // Section: Notification messages
  _createToastElement(messageId, options) {
    const createButton = () => {
      const button = document.createXULElement("button");
      button.id = options.button.id;
      button.classList.add("footer-button");
      button.classList.add("primary");
      button.addEventListener("command", options.button.command);
      return button;
    };

    // Check if this message ID already exists
    for (const child of this._toastContainer.children) {
      if (child._messageId === messageId) {
        child.removeAttribute("button");
        if (options.button) {
          const button = createButton();
          const existingButton = child.querySelector("button");
          if (existingButton) {
            existingButton.remove();
          }
          child.appendChild(button);
          child.setAttribute("button", true);
        }
        return [child, true];
      }
    }
    const wrapper = document.createXULElement("hbox");
    const element = document.createXULElement("vbox");
    const label = document.createXULElement("label");
    document.l10n.setAttributes(label, messageId, options.l10nArgs);
    element.appendChild(label);
    if (options.descriptionId) {
      const description = document.createXULElement("label");
      description.classList.add("description");
      document.l10n.setAttributes(description, options.descriptionId, options);
      element.appendChild(description);
    }
    wrapper.appendChild(element);
    if (options.button) {
      const button = createButton();
      wrapper.appendChild(button);
      wrapper.setAttribute("button", true);
    }
    wrapper.classList.add("zen-toast");
    wrapper._messageId = messageId;
    return [wrapper, false];
  },

  async showToast(messageId, options = {}) {
    const [toast, reused] = this._createToastElement(messageId, options);
    this._toastContainer.removeAttribute("hidden");
    this._toastContainer.appendChild(toast);
    const timeoutFunction = () => {
      if (Services.prefs.getBoolPref("ui.popup.disable_autohide")) {
        return;
      }
      this.animate(
        toast,
        { opacity: [1, 0], transform: ["scale(1)", "scale(0.5)"] },
        { duration: 200 }
      ).then(() => {
        toast.remove();
        if (this._toastContainer.children.length === 0) {
          this._toastContainer.setAttribute("hidden", true);
        }
      });
    };
    if (reused) {
      await this.animate(toast, { transform: "scale(0.2)" }, { duration: 100 });
    } else {
      toast.addEventListener("mouseover", () => {
        if (this._toastTimeouts[messageId]) {
          clearTimeout(this._toastTimeouts[messageId]);
        }
      });
      toast.addEventListener("mouseout", () => {
        if (this._toastTimeouts[messageId]) {
          clearTimeout(this._toastTimeouts[messageId]);
        }
        this._toastTimeouts[messageId] = setTimeout(
          timeoutFunction,
          options.timeout || 2000
        );
      });
    }
    if (!toast.style.transform) {
      toast.style.transform = "scale(0)";
    }
    await this.animate(
      toast,
      { transform: "scale(1)" },
      { bounce: 0.2, duration: 500 }
    );
    if (this._toastTimeouts[messageId]) {
      clearTimeout(this._toastTimeouts[messageId]);
    }
    this._toastTimeouts[messageId] = setTimeout(
      timeoutFunction,
      options.timeout || 2000
    );
  },

  panelUIPosition(panel, anchor) {
    // The alignment position of the panel is determined during the "popuppositioned" event
    // when the panel opens. The alignment positions help us determine in which orientation
    // the panel is anchored to the screen space.
    //
    // *  "after_start": The panel is anchored at the top-left     corner in LTR locales, top-right    in RTL locales.
    // *    "after_end": The panel is anchored at the top-right    corner in LTR locales, top-left     in RTL locales.
    // * "before_start": The panel is anchored at the bottom-left  corner in LTR locales, bottom-right in RTL locales.
    // *   "before_end": The panel is anchored at the bottom-right corner in LTR locales, bottom-left  in RTL locales.
    //
    //   ┌─Anchor(LTR)          ┌─Anchor(RTL)
    //   │       Anchor(RTL)─┐  │       Anchor(LTR)─┐
    //   │                   │  │                   │
    //   x───────────────────x  x───────────────────x
    //   │                   │  │                   │
    //   │       Panel       │  │       Panel       │
    //   │   "after_start"   │  │    "after_end"    │
    //   │                   │  │                   │
    //   └───────────────────┘  └───────────────────┘
    //
    //   ┌───────────────────┐  ┌───────────────────┐
    //   │                   │  │                   │
    //   │       Panel       │  │       Panel       │
    //   │   "before_start"  │  │    "before_end"   │
    //   │                   │  │                   │
    //   x───────────────────x  x───────────────────x
    //   │                   │  │                   │
    //   │       Anchor(RTL)─┘  │       Anchor(LTR)─┘
    //   └─Anchor(LTR)          └─Anchor(RTL)
    //
    // The default choice for the panel is "after_start", to match the content context menu's alignment. However, it is
    // possible to end up with any of the four combinations. Before the panel is opened, the XUL popup manager needs to
    // make a determination about the size of the panel and whether or not it will fit within the visible screen area with
    // the intended alignment. The manager may change the panel's alignment before opening to ensure the panel is fully visible.
    //
    // For example, if the panel is opened such that the bottom edge would be rendered off screen, then the XUL popup manager
    // will change the alignment from "after_start" to "before_start", anchoring the panel's bottom corner to the target screen
    // location instead of its top corner. This transformation ensures that the whole of the panel is visible on the screen.
    //
    // When the panel is anchored by one of its bottom corners (the "before_..." options), then it causes unintentionally odd
    // behavior where dragging the text-area resizer downward with the mouse actually grows the panel's top edge upward, since
    // the bottom of the panel is anchored in place. We want to disable the resizer if the panel was positioned to be anchored
    // from one of its bottom corners.
    let block = "bottomleft";
    let inline = "topleft";
    if (anchor?.closest("#zen-sidebar-top-buttons")) {
      block = "topleft";
    }
    if (
      (gZenVerticalTabsManager._hasSetSingleToolbar &&
        gZenVerticalTabsManager._prefsRightSide) ||
      (panel?.id === "zen-unified-site-data-panel" &&
        !gZenVerticalTabsManager._hasSetSingleToolbar) ||
      (panel?.id === "unified-extensions-panel" &&
        gZenVerticalTabsManager._hasSetSingleToolbar)
    ) {
      block = "bottomright";
      inline = "topright";
    }
    return `${block} ${inline}`;
  },

  urlStringsDomainMatch(url1, url2) {
    if (!url1.startsWith("http") || !url2?.startsWith("http")) {
      return false;
    }
    return Services.io.newURI(url1).host === Services.io.newURI(url2).host;
  },

  getOpenUILinkWhere(url, browser, openUILinkWhere) {
    try {
      let tab = gBrowser.getTabForBrowser(browser);
      if (
        openUILinkWhere === "current" &&
        !this.urlStringsDomainMatch(url, browser.currentURI.spec) &&
        tab.pinned &&
        Services.prefs.getBoolPref("zen.tabs.open-pinned-in-new-tab")
      ) {
        return "tab";
      }
    } catch (e) {
      console.error("Error in getOpenUILinkWhere:", e);
    }
    return openUILinkWhere;
  },
};

XPCOMUtils.defineLazyPreferenceGetter(
  gZenUIManager,
  "contentElementSeparation",
  "zen.theme.content-element-separation",
  0
);

XPCOMUtils.defineLazyPreferenceGetter(
  gZenUIManager,
  "urlbarWaitToClear",
  "zen.urlbar.wait-to-clear",
  0
);
XPCOMUtils.defineLazyPreferenceGetter(
  gZenUIManager,
  "urlbarShowDomainOnly",
  "zen.urlbar.show-domain-only-in-sidebar",
  true
);

window.gZenVerticalTabsManager = {
  init() {
    this._multiWindowFeature = new nsZenMultiWindowFeature();
    this._initWaitPromise();

    ChromeUtils.defineLazyGetter(this, "isWindowsStyledButtons", () => {
      return !(
        window.AppConstants.platform === "macosx" ||
        window.matchMedia("(-moz-gtk-csd-reversed-placement)").matches ||
        Services.prefs.getBoolPref(
          "zen.view.experimental-force-window-controls-left"
        )
      );
    });

    ChromeUtils.defineLazyGetter(this, "hidesTabsToolbar", () => {
      return document.documentElement.hasAttribute("popup-window");
    });

    var updateEvent = this._updateEvent.bind(this);
    var onPrefChange = this._onPrefChange.bind(this);

    this.initializePreferences(onPrefChange);
    this._toolbarOriginalParent =
      document.getElementById("nav-bar").parentElement;

    gZenCompactModeManager.addEventListener(updateEvent);
    this.initRightSideOrderContextMenu();

    window.addEventListener(
      "customizationstarting",
      this._preCustomize.bind(this)
    );
    window.addEventListener(
      "aftercustomization",
      this._postCustomize.bind(this)
    );

    this._updateEvent();

    if (!this.isWindowsStyledButtons) {
      document.documentElement.setAttribute(
        "zen-window-buttons-reversed",
        true
      );
    }

    this._renameTabHalt = this.renameTabHalt.bind(this);
    gBrowser.tabContainer.addEventListener(
      "dblclick",
      this.renameTabStart.bind(this)
    );
  },

  toggleExpand() {
    const newVal = !Services.prefs.getBoolPref("zen.view.sidebar-expanded");
    Services.prefs.setBoolPref("zen.view.sidebar-expanded", newVal);
    Services.prefs.setBoolPref("zen.view.use-single-toolbar", false);
  },

  get navigatorToolbox() {
    return gNavToolbox;
  },

  initRightSideOrderContextMenu() {
    const kConfigKey = "zen.tabs.vertical.right-side";
    const fragment = window.MozXULElement.parseXULToFragment(`
      <menuitem id="zen-toolbar-context-tabs-right"
                type="checkbox"
                ${Services.prefs.getBoolPref(kConfigKey) ? 'checked="true"' : ""}
                data-lazy-l10n-id="zen-toolbar-context-tabs-right"
                command="cmd_zenToggleTabsOnRight"
        />
    `);
    document.getElementById("toolbar-context-customize").before(fragment);
  },

  get _topButtonsSeparatorElement() {
    if (this.__topButtonsSeparatorElement) {
      return this.__topButtonsSeparatorElement;
    }
    this.__topButtonsSeparatorElement = document.getElementById(
      "zen-sidebar-top-buttons-separator"
    );
    return this.__topButtonsSeparatorElement;
  },

  /**
   * Whether aItem is a strip item that should animate in. Checked again a
   * frame after the item opens, because split view only claims a tab once it
   * has been created.
   *
   * @param {Element} aItem
   * @returns {boolean}
   */
  _canAnimateItemOpen(aItem) {
    return !(
      gReduceMotion ||
      !aItem ||
      !gZenUIManager._hasLoadedDOM ||
      !aItem.isConnected ||
      // We do want to do some animations during testing with profiling enabled
      // so we can capture and improve them.
      (gZenUIManager.testingEnabled && !gZenUIManager.profilingEnabled) ||
      !gZenStartup.isReady ||
      aItem.group?.hasAttribute("split-view-group") ||
      window.gZenViewSplitter?.waitingForSplitTab
    );
  },

  animateItemOpen(aItem) {
    if (!this._canAnimateItemOpen(aItem)) {
      return;
    }

    try {
      // Hold the start state now so the item doesn't show for a frame, then
      // start once its destination is settled.
      aItem.style.opacity = "0";
      window.requestAnimationFrame(() => {
        if (!this._canAnimateItemOpen(aItem)) {
          aItem.style.removeProperty("opacity");
          return;
        }
        this._startItemOpenAnimation(aItem);
      });
    } catch (e) {
      console.error(e);
    }
  },

  /**
   * @param {Element} aItem
   */
  _startItemOpenAnimation(aItem) {
    try {
      const { height } = aItem.getBoundingClientRect();
      const below = this._itemsBelow(aItem);
      if (below.length) {
        gZenUIManager.animate(
          below,
          { transform: [`translateY(-${height}px)`, "translateY(0)"] },
          { duration: 120, fill: "none" }
        );
      }
      gZenUIManager.animate(
        aItem,
        {
          opacity: [0, 1],
          transform: ["scale(0.95)", "scale(1)"],
        },
        { duration: 120, fill: "none" }
      );
      // The running animation holds the start state from here on.
      aItem.style.removeProperty("opacity");
    } catch (e) {
      console.error(e);
    }
  },

  animateItemClose(aItem) {
    if (
      aItem.hasAttribute("zen-essential") ||
      aItem.group?.hasAttribute("split-view-group") ||
      gReduceMotion
    ) {
      return Promise.resolve();
    }
    try {
      const { height } = window.windowUtils.getBoundsWithoutFlushing(aItem);
      const below = this._itemsBelow(aItem);
      return Promise.all([
        gZenUIManager.animate(
          aItem,
          {
            opacity: [1, 0],
            transform: ["scale(1)", "scale(0.95)"],
          },
          { duration: 100 }
        ),
        below.length &&
          gZenUIManager.animate(
            below,
            { transform: ["translateY(0)", `translateY(-${height}px)`] },
            { duration: 100 }
          ),
      ]).then(() => {
        // The caller removes aItem in the same microtask checkpoint, so the
        // items below take its place in the frame they lose their offset.
        below.forEach(item => item.style.removeProperty("transform"));
      });
    } catch (e) {
      // The caller removes the tab once this resolves, so it must resolve.
      console.error(e);
      return Promise.resolve();
    }
  },

  /**
   * The visible strip items below aItem: its following siblings at each level
   * up to the space, so a folder moves with its tabs.
   *
   * @param {Element} aItem
   * @returns {Element[]}
   */
  _itemsBelow(aItem) {
    const space = aItem.closest("zen-workspace");
    const { height } = window.windowUtils.getBoundsWithoutFlushing(aItem);
    const items = [];
    if (!space?.active || !height || aItem.hasAttribute("zen-essential")) {
      return items;
    }
    for (let el = aItem; el.parentElement !== space; el = el.parentElement) {
      for (
        let next = el.nextElementSibling;
        next;
        next = next.nextElementSibling
      ) {
        const rect = window.windowUtils.getBoundsWithoutFlushing(next);
        // ponytail: stops at the window's bottom edge, not the scroll box's;
        // clip to the scroll box if long strips still animate unseen items.
        if (rect.top > window.innerHeight) {
          break;
        }
        if (rect.height) {
          items.push(next);
        }
      }
    }
    return items;
  },

  get actualWindowButtons() {
    // we have multiple ".titlebar-buttonbox-container" in the DOM, because of the titlebar
    if (!this.__actualWindowButtons) {
      this.__actualWindowButtons = !this.isWindowsStyledButtons
        ? document.querySelector(".titlebar-buttonbox-container") // TODO: test if it works 100% of the time
        : document.querySelector("#nav-bar .titlebar-buttonbox-container");
      this.__actualWindowButtons.setAttribute("overflows", "false");
    }
    return this.__actualWindowButtons;
  },

  async _preCustomize() {
    await this._multiWindowFeature.foreachWindowAsActive(async browser => {
      browser.gZenVerticalTabsManager._updateEvent({
        forCustomizableMode: true,
        dontRebuildAreas: true,
      });
    });
    this.rebuildAreas();
    this.navigatorToolbox.setAttribute("zen-sidebar-expanded", "true");
    document.documentElement.setAttribute("zen-sidebar-expanded", "true"); // force expanded sidebar
  },

  _postCustomize() {
    // No need to use `await` here, because the customization is already done
    this._multiWindowFeature.foreachWindowAsActive(async browser => {
      browser.gZenVerticalTabsManager._updateEvent({ dontRebuildAreas: true });
    });
  },

  initializePreferences(updateEvent) {
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefsVerticalTabs",
      "zen.tabs.vertical",
      true,
      updateEvent
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefsRightSide",
      "zen.tabs.vertical.right-side",
      false,
      updateEvent
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefsUseSingleToolbar",
      "zen.view.use-single-toolbar",
      false,
      updateEvent
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefsSidebarExpanded",
      "zen.view.sidebar-expanded",
      false,
      updateEvent
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefsSidebarExpandedMaxWidth",
      "zen.view.sidebar-expanded.max-width",
      300,
      updateEvent
    );
  },

  _initWaitPromise() {
    this._waitPromise = new Promise(resolve => {
      this._resolveWaitPromise = resolve;
    });
  },

  async _onPrefChange() {
    this._resolveWaitPromise();

    // only run if we are in the active window
    await this._multiWindowFeature.foreachWindowAsActive(async browser => {
      if (
        browser.gZenVerticalTabsManager._multiWindowFeature.windowIsActive(
          browser
        )
      ) {
        return;
      }
      await browser.gZenVerticalTabsManager._waitPromise;
      browser.gZenVerticalTabsManager._updateEvent({ dontRebuildAreas: true });
      browser.gZenVerticalTabsManager._initWaitPromise();
    });

    if (nsZenMultiWindowFeature.isActiveWindow) {
      this._updateEvent();
      this._initWaitPromise();
    }
  },

  recalculateURLBarHeight(updateFormat = false) {
    if (gZenWorkspaces._processingResize) {
      return;
    }
    this._pendingUrlbarFormatUpdate ||= updateFormat;
    if (this._urlbarHeightRecalcScheduled) {
      return;
    }
    this._urlbarHeightRecalcScheduled = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        delete this._urlbarHeightRecalcScheduled;
        const shouldUpdateFormat = this._pendingUrlbarFormatUpdate;
        delete this._pendingUrlbarFormatUpdate;
        gURLBar.removeAttribute("--urlbar-height");
        let height;
        if (!this._hasSetSingleToolbar) {
          height = AppConstants.platform == "macosx" ? 34 : 32;
        } else if (!gURLBar.hasAttribute("breakout-extend")) {
          height = 38;
        }
        if (typeof height !== "undefined") {
          gURLBar.style.setProperty("--urlbar-height", `${height}px`);
        }
        gURLBar.style.setProperty(
          "--urlbar-width",
          `${window.windowUtils.getBoundsWithoutFlushing(document.getElementById("urlbar-container")).width}px`
        );
        if (shouldUpdateFormat) {
          gURLBar.zenFormatURLValue();
        }
      });
    });
  },

  getSidebarMinWidth() {
    if (AppConstants.platform === "macosx") {
      return 163;
    }

    if (this._prefsRightSide && this._prefsUseSingleToolbar) {
      let captionButtons = this.actualWindowButtons;
      let captionButtonsWidth =
        window.windowUtils.getBoundsWithoutFlushing(captionButtons).width;
      return 117 + captionButtonsWidth;
    }

    return 152;
  },

  // eslint-disable-next-line complexity
  _updateEvent({ forCustomizableMode = false, dontRebuildAreas = false } = {}) {
    if (this._isUpdating) {
      return;
    }
    this._isUpdating = true;
    try {
      this._updateMaxWidth();

      if (window.docShell) {
        window.docShell.treeOwner
          .QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIAppWindow)
          .rollupAllPopups();
      }

      const topButtons = document.getElementById("zen-sidebar-top-buttons");
      const isCompactMode =
        gZenCompactModeManager.preference && !forCustomizableMode;
      const isVerticalTabs = this._prefsVerticalTabs || forCustomizableMode;
      const isSidebarExpanded = this._prefsSidebarExpanded || !isVerticalTabs;
      const isRightSide = this._prefsRightSide && isVerticalTabs;
      const isSingleToolbar =
        ((this._prefsUseSingleToolbar && isVerticalTabs && isSidebarExpanded) ||
          !isVerticalTabs) &&
        !forCustomizableMode &&
        !this.hidesTabsToolbar;
      const titlebar = document.getElementById("titlebar");

      gBrowser.tabContainer.setAttribute(
        "orient",
        isVerticalTabs ? "vertical" : "horizontal"
      );
      gBrowser.tabContainer.arrowScrollbox.setAttribute(
        "orient",
        isVerticalTabs ? "vertical" : "horizontal"
      );
      // on purpose, we set the orient to horizontal, because the arrowScrollbox is vertical
      gBrowser.tabContainer.arrowScrollbox.scrollbox.setAttribute(
        "orient",
        isVerticalTabs ? "vertical" : "horizontal"
      );

      const buttonsTarget = document.getElementById(
        "zen-sidebar-top-buttons-customization-target"
      );
      if (isRightSide) {
        this.navigatorToolbox.setAttribute("zen-right-side", "true");
        document.documentElement.setAttribute("zen-right-side", "true");
      } else {
        this.navigatorToolbox.removeAttribute("zen-right-side");
        document.documentElement.removeAttribute("zen-right-side");
      }

      const wasSidebarExpanded = document.documentElement.hasAttribute(
        "zen-sidebar-expanded"
      );
      if (isSidebarExpanded !== wasSidebarExpanded) {
        delete this._hadSidebarCollapse;
        if (isSidebarExpanded) {
          this._hadSidebarCollapse = true;
          this.navigatorToolbox.setAttribute("zen-sidebar-expanded", "true");
          document.documentElement.setAttribute("zen-sidebar-expanded", "true");
          gBrowser.tabContainer.setAttribute("expanded", "true");
        } else {
          this.navigatorToolbox.removeAttribute("zen-sidebar-expanded");
          document.documentElement.removeAttribute("zen-sidebar-expanded");
          gBrowser.tabContainer.removeAttribute("expanded");
        }
      }

      const appContentNavbarContaienr = document.getElementById(
        "zen-appcontent-navbar-container"
      );
      const appContentNavbarWrapper = document.getElementById(
        "zen-appcontent-navbar-wrapper"
      );
      appContentNavbarWrapper.style.transition = "none";
      let shouldHide = false;
      if (
        ((!isRightSide && this.isWindowsStyledButtons) ||
          (isRightSide && !this.isWindowsStyledButtons) ||
          (isCompactMode && isSingleToolbar && this.isWindowsStyledButtons)) &&
        isSingleToolbar
      ) {
        appContentNavbarWrapper.setAttribute("should-hide", true);
        shouldHide = true;
      } else {
        appContentNavbarWrapper.removeAttribute("should-hide");
      }

      // Check if the sidebar is in hover mode
      if (
        !this.navigatorToolbox.hasAttribute("zen-right-side") &&
        !isCompactMode
      ) {
        this.navigatorToolbox.prepend(topButtons);
      }

      let windowButtons = this.actualWindowButtons;
      let doNotChangeWindowButtons =
        !isCompactMode && isRightSide && this.isWindowsStyledButtons;
      const navBar = document.getElementById("nav-bar");

      if (isSingleToolbar) {
        this._navbarParent = navBar.parentElement;
        let elements = Array.from(
          document.querySelectorAll(
            '#nav-bar-customization-target > :is([cui-areatype="toolbar"], .chromeclass-toolbar-additional):not(#urlbar-container):not(toolbarspring)'
          )
        );
        let normalButtons = [];
        let extensionButtons = [];
        for (const element of elements) {
          if (
            element.hasAttribute("data-extensionid") &&
            Services.prefs.getBoolPref("zen.view.overflow-webext-toolbar", true)
          ) {
            extensionButtons.push(element);
          } else {
            normalButtons.push(element);
          }
        }
        // Add separator if it doesn't exist
        if (!this._hasSetSingleToolbar) {
          buttonsTarget.append(this._topButtonsSeparatorElement);
        }
        this._hasSetSingleToolbar = true;
        for (const button of normalButtons.reverse()) {
          this.appendCustomizableItem(this._topButtonsSeparatorElement, button);
        }
        for (const extension of extensionButtons) {
          this.appendCustomizableItem(
            this._topButtonsSeparatorElement,
            extension
          );
        }
        buttonsTarget.prepend(
          document.getElementById("unified-extensions-button")
        );
        const panelUIButton = document.getElementById("PanelUI-button");
        buttonsTarget.prepend(panelUIButton);
        panelUIButton.setAttribute("overflows", "false");
        buttonsTarget.parentElement.append(
          document.getElementById("nav-bar-overflow-button")
        );
        if (this.isWindowsStyledButtons && !doNotChangeWindowButtons) {
          appContentNavbarContaienr.append(windowButtons);
        }
        if (isCompactMode) {
          titlebar.moveBefore(navBar, titlebar.firstChild);
          titlebar.moveBefore(topButtons, titlebar.firstChild);
        } else {
          titlebar.parentNode.moveBefore(topButtons, titlebar);
          titlebar.parentNode.moveBefore(navBar, titlebar);
        }
        document.documentElement.setAttribute("zen-single-toolbar", true);
      } else if (this._hasSetSingleToolbar) {
        this._hasSetSingleToolbar = false;
        // Do the opposite
        this._navbarParent.prepend(navBar);
        const elements = document.querySelectorAll(
          '#zen-sidebar-top-buttons-customization-target > :is([cui-areatype="toolbar"], .chromeclass-toolbar-additional)'
        );
        for (const button of elements) {
          document
            .getElementById("nav-bar-customization-target")
            .append(button);
        }
        this._topButtonsSeparatorElement.remove();
        document.documentElement.removeAttribute("zen-single-toolbar");
        const panelUIButton = document.getElementById("PanelUI-button");
        navBar.appendChild(panelUIButton);
        panelUIButton.removeAttribute("overflows");
        navBar.appendChild(document.getElementById("nav-bar-overflow-button"));
        this._toolbarOriginalParent.prepend(navBar);
        if (!dontRebuildAreas) {
          this.rebuildAreas();
        }
      }

      if (isCompactMode) {
        titlebar.prepend(topButtons);
      } else if (isSidebarExpanded) {
        titlebar.before(topButtons);
      } else {
        titlebar.prepend(topButtons);
      }

      // Case: single toolbar, not compact mode, not right side and macos styled buttons
      if (
        !doNotChangeWindowButtons &&
        isSingleToolbar &&
        !isCompactMode &&
        !isRightSide &&
        !this.isWindowsStyledButtons
      ) {
        topButtons.prepend(windowButtons);
      }

      const canHideTabBarPref = Services.prefs.getBoolPref(
        "zen.view.compact.hide-tabbar"
      );
      const captionsShouldStayOnSidebar =
        !canHideTabBarPref &&
        ((!this.isWindowsStyledButtons && !isRightSide) ||
          (this.isWindowsStyledButtons && isRightSide));
      if (
        (!isSingleToolbar && isCompactMode && !captionsShouldStayOnSidebar) ||
        !isSidebarExpanded
      ) {
        navBar.prepend(topButtons);
      }

      // Case: single toolbar, compact mode, right side and windows styled buttons
      if (
        isSingleToolbar &&
        isCompactMode &&
        isRightSide &&
        this.isWindowsStyledButtons
      ) {
        topButtons.prepend(windowButtons);
      }

      if (doNotChangeWindowButtons) {
        if (isRightSide && !isSidebarExpanded) {
          navBar.appendChild(windowButtons);
        } else {
          topButtons.appendChild(windowButtons);
        }
      } else if (!isSingleToolbar && !isCompactMode) {
        if (this.isWindowsStyledButtons) {
          if (isRightSide) {
            appContentNavbarContaienr.append(windowButtons);
          } else {
            navBar.append(windowButtons);
          }
        } else {
          // not windows styled buttons
          // eslint-disable-next-line no-lonely-if
          if (isRightSide || !isSidebarExpanded) {
            navBar.prepend(windowButtons);
          } else {
            topButtons.prepend(windowButtons);
          }
        }
      } else if (!isSingleToolbar && isCompactMode) {
        if (captionsShouldStayOnSidebar) {
          topButtons.prepend(windowButtons);
        } else {
          navBar.appendChild(windowButtons);
        }
      } else if (isSingleToolbar && isCompactMode) {
        if (!isRightSide && !this.isWindowsStyledButtons) {
          topButtons.prepend(windowButtons);
        }
      }

      if (shouldHide) {
        appContentNavbarContaienr.append(windowButtons);
      }

      if (
        this._hasSetSingleToolbar &&
        Services.prefs.getBoolPref("zen.view.overflow-webext-toolbar", true)
      ) {
        topButtons.setAttribute(
          "addon-webext-overflowtarget",
          "zen-overflow-extensions-list"
        );
      } else {
        topButtons.setAttribute(
          "addon-webext-overflowtarget",
          "overflowed-extensions-list"
        );
      }

      gZenCompactModeManager.updateCompactModeContext(isSingleToolbar);
      window.dispatchEvent(new Event("resize"));
      gZenUIManager.updateTabsToolbar();
      this.rebuildURLBarMenus();
      appContentNavbarWrapper.style.transition = "";
    } catch (e) {
      console.error(e);
    }
    this._isUpdating = false;
  },

  rebuildURLBarMenus() {
    gURLBar.updatePlaceholder();
  },

  rebuildAreas() {
    CustomizableUI.zenInternalCU._rebuildRegisteredAreas(
      /* zenDontRebuildCollapsed */ true
    );
  },

  _updateMaxWidth() {
    const maxWidth = Services.prefs.getIntPref(
      "zen.view.sidebar-expanded.max-width"
    );
    const toolbox = gNavToolbox;
    toolbox.style.setProperty(
      "--zen-toolbox-min-width",
      `${this.getSidebarMinWidth()}px`
    );
    if (!this._prefsCompactMode) {
      toolbox.style.maxWidth = `${maxWidth}px`;
    } else {
      toolbox.style.removeProperty("maxWidth");
    }
  },

  get expandButton() {
    if (this._expandButton) {
      return this._expandButton;
    }
    this._expandButton = document.getElementById("zen-expand-sidebar-button");
    return this._expandButton;
  },

  toggleTabsOnRight() {
    const newVal = !Services.prefs.getBoolPref("zen.tabs.vertical.right-side");
    Services.prefs.setBoolPref("zen.tabs.vertical.right-side", newVal);
  },

  appendCustomizableItem(target, child, placements = []) {
    if (
      this._hasSetSingleToolbar &&
      (target.id === "zen-sidebar-top-buttons-customization-target" ||
        target === this._topButtonsSeparatorElement)
    ) {
      if (placements.includes(child.id)) {
        this._topButtonsSeparatorElement.before(child);
        return;
      } else if (
        child.hasAttribute("data-extensionid") &&
        Services.prefs.getBoolPref("zen.view.overflow-webext-toolbar", true)
      ) {
        if (gURLBar._isOverflowingItems) {
          const overflowElements = document.getElementById(
            "zen-overflow-extensions-list"
          );
          overflowElements.appendChild(child);
        } else {
          const element = document.getElementById("page-action-buttons");
          child.setAttribute("context", "toolbar-context-menu");
          element.before(child);
        }
        return;
      }
    }
    if (target === this._topButtonsSeparatorElement) {
      this._topButtonsSeparatorElement.after(child);
    } else {
      target.appendChild(child);
    }
  },

  async renameTabKeydown(event) {
    event.stopPropagation();
    if (event.key === "Enter") {
      const isTab = !!event.target.closest(".tabbrowser-tab");
      let label = isTab
        ? this._tabEdited.querySelector(".tab-label-container-editing")
        : this._tabEdited;
      let input = document.getElementById("tab-label-input");
      let newName = input.value.replace(/\s+/g, " ").trim();
      const hasChanged = input.value !== input._originalValue && newName;

      document.documentElement.removeAttribute("zen-renaming-tab");
      input.remove();
      if (!isTab) {
        await this._tabEdited.onRenameFinished(newName);
      } else {
        // Check if name is blank, reset if so
        // Always remove, so we can always rename and if it's empty,
        // it will reset to the original name anyway
        if (hasChanged || (this._tabEdited.zenStaticLabel && newName)) {
          this._tabEdited.zenStaticLabel = newName;
          gBrowser._setTabLabel(this._tabEdited, newName, {
            _zenChangeLabelFlag: true,
          });
          gZenUIManager.showToast("zen-tabs-renamed");
        } else {
          delete this._tabEdited.zenStaticLabel;
          gBrowser.setTabTitle(this._tabEdited);
        }

        gZenUIManager.animate(
          this._tabEdited,
          {
            scale: [1, 0.98, 1],
          },
          { duration: 250, fill: "none" }
        );
      }

      const editorContainer = this._tabEdited.querySelector(
        ".tab-editor-container"
      );
      if (editorContainer) {
        editorContainer.remove();
      }
      label.classList.remove("tab-label-container-editing");

      this._tabEdited = null;
    } else if (event.key === "Escape") {
      event.target.blur();
    }
  },

  renameTabStart(event) {
    let target = event.target;
    const isTab = !!target.closest(".tabbrowser-tab");
    // ponytail: Origin cut tab rename, so the isTab branches in the rename
    // functions are dead; delete them when this code is next reworked.
    if (
      this._tabEdited ||
      isTab ||
      !gZenVerticalTabsManager._prefsSidebarExpanded
    ) {
      return;
    }
    if (
      isTab &&
      !target.closest(".tab-label-container") &&
      event.type === "dblclick"
    ) {
      return;
    }
    this._tabEdited =
      target.closest(".tabbrowser-tab") ||
      target.closest(".zen-current-workspace-indicator-name") ||
      (event.explicit && target.closest(".tab-group-label"));
    if (
      !this._tabEdited ||
      (this._tabEdited.hasAttribute("zen-essential") && isTab)
    ) {
      this._tabEdited = null;
      return;
    }
    gZenFolders.cancelPopupTimer();
    event.stopPropagation?.();
    document.documentElement.setAttribute("zen-renaming-tab", "true");
    const label = isTab
      ? this._tabEdited.querySelector(".tab-label-container")
      : this._tabEdited;
    label.classList.add("tab-label-container-editing");

    if (isTab) {
      const container = window.MozXULElement.parseXULToFragment(`
        <vbox class="tab-label-container tab-editor-container" flex="1" align="start" pack="center"></vbox>
      `);
      label.after(container);
    }
    const input = document.createElement("input");
    const content = isTab ? this._tabEdited.label : this._tabEdited.textContent;
    input.id = "tab-label-input";
    input._originalValue = content;
    input.value = content;
    input.addEventListener("keydown", this.renameTabKeydown.bind(this));

    if (isTab) {
      const containerHtml = this._tabEdited.querySelector(
        ".tab-editor-container"
      );
      containerHtml.appendChild(input);
    } else {
      this._tabEdited.after(input);
    }
    input.focus();
    input.setSelectionRange(0, input.value.length, "backward");
    input.scrollLeft = 0;

    input.addEventListener("blur", this._renameTabHalt);
  },

  renameTabHalt(event) {
    if (document.activeElement === event.target || !this._tabEdited) {
      return;
    }
    document.documentElement.removeAttribute("zen-renaming-tab");
    const editorContainer = this._tabEdited.querySelector(
      ".tab-editor-container"
    );
    let input = document.getElementById("tab-label-input");
    input.remove();
    if (editorContainer) {
      editorContainer.remove();
    }
    const isTab = !!this._tabEdited.closest(".tabbrowser-tab");
    const label = isTab
      ? this._tabEdited.querySelector(".tab-label-container-editing")
      : this._tabEdited;
    label.classList.remove("tab-label-container-editing");

    this._tabEdited = null;
  },
};

XPCOMUtils.defineLazyPreferenceGetter(
  gZenVerticalTabsManager,
  "_canReplaceNewTab",
  "zen.urlbar.replace-newtab",
  true
);
