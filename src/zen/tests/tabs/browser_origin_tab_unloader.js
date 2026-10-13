/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { OriginTabUnloader } = ChromeUtils.importESModule(
  "chrome://browser/content/zen-components/OriginTabUnloader.sys.mjs"
);

const isLoaded = tab =>
  tab.linkedBrowser.isConnected && !tab.hasAttribute("pending");

add_task(async function test_unload_idle_background_tabs() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["origin.tabs.unload-after-minutes", 1],
      ["origin.tabs.unload-essentials", false],
    ],
  });

  const background = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  const essential = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.org/"
  );
  gZenPinnedTabManager.addToEssentials(essential);
  const selected = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.net/"
  );

  // Pretend both background tabs were left five minutes ago.
  const old = Date.now() - 5 * 60 * 1000;
  background.updateLastAccessed(old);
  essential.updateLastAccessed(old);
  selected.updateLastAccessed(old); // ignored: a selected tab stays at Infinity
  // Background time counts from session start at the earliest; move it back too.
  const sessionStart = OriginTabUnloader._sessionStart;
  OriginTabUnloader._sessionStart = old;

  await OriginTabUnloader.unloadIdleTabs();
  OriginTabUnloader._sessionStart = sessionStart;

  ok(!isLoaded(background), "An idle background tab unloads");
  ok(isLoaded(essential), "An Essential stays loaded");
  ok(isLoaded(selected), "The selected tab stays loaded");

  await SpecialPowers.popPrefEnv();
  for (const tab of [background, essential, selected]) {
    await BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_trim_once_per_idle_period() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["origin.tabs.unload-after-minutes", 0],
      ["origin.memory.trim-after-idle-minutes", 1],
    ],
  });

  let trims = 0;
  const observer = (subject, topic, data) => {
    if (data == "heap-minimize") {
      trims++;
    }
  };
  Services.obs.addObserver(observer, "memory-pressure");
  // Pretend the user has not touched anything for five minutes.
  const { _userIdleMs, _trimmedAt } = OriginTabUnloader;
  OriginTabUnloader._userIdleMs = () => 5 * 60 * 1000;
  OriginTabUnloader._trimmedAt = 0;

  await OriginTabUnloader._tick();
  is(trims, 1, "The first idle tick sends one heap-minimize");
  await OriginTabUnloader._tick();
  is(trims, 1, "A second tick in the same idle period sends none");

  // The user works in another app: input continues, but no Origin window is active.
  const { _inactiveMs } = OriginTabUnloader;
  OriginTabUnloader._userIdleMs = () => 0;
  OriginTabUnloader._inactiveMs = () => 5 * 60 * 1000;
  OriginTabUnloader._trimmedAt = 0;
  await OriginTabUnloader._tick();
  is(trims, 2, "Five minutes behind another app send one heap-minimize");
  await OriginTabUnloader._tick();
  is(trims, 2, "A second tick behind the same app sends none");

  OriginTabUnloader._userIdleMs = _userIdleMs;
  OriginTabUnloader._inactiveMs = _inactiveMs;
  OriginTabUnloader._trimmedAt = _trimmedAt;
  Services.obs.removeObserver(observer, "memory-pressure");
  await SpecialPowers.popPrefEnv();
});
