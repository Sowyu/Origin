// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Plays the full-window sweep shown after updates. Also used the first
 * time incoming sync data is applied on this profile.
 */
export async function playWindowSweepAnimation() {
  await gZenWorkspaces.promiseInitialized;
  const appWrapper = document.getElementById("zen-main-app-wrapper");
  const element = document.createElement("div");
  element.id = "zen-update-animation";
  const elementBorder = document.createElement("div");
  elementBorder.id = "zen-update-animation-border";
  requestIdleCallback(() => {
    if (gReduceMotion) {
      return;
    }
    appWrapper.appendChild(element);
    appWrapper.appendChild(elementBorder);
    // The sweep runs as CSS keyframes, see zen-single-components.css. The
    // border's highlight starts 80 ms later and ends last.
    elementBorder.addEventListener(
      "animationend",
      () => {
        element.remove();
        elementBorder.remove();
      },
      { once: true }
    );
  });
}
