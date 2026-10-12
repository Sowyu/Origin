# Benchmark fixtures

Frozen copies of real web pages plus a few small test pages of our own. The energy benchmark loads them from this Mac, so the network adds no noise.

## Where they live

`/Users/mrm/Zen-Origin-research/fixtures/sites/<name>/index.html`, with assets in `assets/` next to it. A local server serves each directory at `http://<name>.localhost:8765/` by Host header. All URLs inside the pages are root-relative.

The frozen pages are copyrighted, so they stay out of git. Only `pages.json`, `manifest.sha256`, `synthetic/` and this file are committed.

## Rebuild

    scripts/perf/make-fixtures            # rebuild everything
    scripts/perf/make-fixtures mdn bbc    # only these pages
    scripts/perf/make-fixtures --refresh  # drop the download cache and fetch again
    scripts/perf/make-fixtures --verify   # compare the files with manifest.sha256

Raw downloads are cached in `/Users/mrm/Zen-Origin-research/downloads/page-cache`, so a rerun without `--refresh` gives byte-identical files. A fresh fetch will differ because the live pages change. Skipped downloads go to `/Users/mrm/Zen-Origin-research/logs/fixtures-freeze.log`.

Freezing removes all scripts, inline `on*` handlers, iframes, preload/prefetch/preconnect links and meta refresh. Stylesheets, fonts and images are downloaded and rewritten to local paths. Remote URLs that could not be downloaded are emptied. Anchor links stay absolute. The `noscript` contents are kept untouched.

## Pages (frozen 2026-10-12)

| name | group | original URL |
| --- | --- | --- |
| mdn | work | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map |
| github | work | https://github.com/mozilla-firefox/firefox |
| stackoverflow | work | https://stackoverflow.com/questions/231767/what-does-the-yield-keyword-do-in-python |
| pythondocs | work | https://docs.python.org/3/library/functions.html |
| rustblog | work | https://blog.rust-lang.org/2026/10/01/Rust-1.99.0/ |
| wikipedia | personal | https://en.wikipedia.org/wiki/Octopus |
| guardian | personal | https://www.theguardian.com/money/2026/oct/12/father-dna-test-passport-daughter-dual-national |
| bbc | personal | https://www.bbc.com/news/articles/c64g1l5389kvo |
| hackernews | personal | https://news.ycombinator.com/ |
| arstechnica | personal | https://arstechnica.com/ai/2026/10/ai-coding-agents-generate-more-code-but-not-more-software/ |
| longread | long | https://en.wikipedia.org/wiki/United_States |

Stack Overflow blocks scripted downloads with a Cloudflare challenge. That page and its assets come from the Internet Archive copy of the same URL (`"archive": true` in `pages.json`), so the layout is from an older Stack Overflow design.

## Synthetic pages

In `synthetic/`, committed, copied to the matching site directory by `make-fixtures`:

- `textarea`: one empty 800 by 400 textarea.
- `timer`: counter and document title updated every second.
- `media`: 1280 by 720 video, `?mode=windowed` or `?mode=fullscreen`, click to start.
- `launch`: solid #ff00ff, to detect first paint.
- `blank`: empty white page.

## Video

`sites/media/bbb-1080p30-130s.mp4` is the first 130 seconds of `bbb_sunflower_1080p_30fps_normal.mp4` from https://download.blender.org/demo/movies/BBB/, cut with ffmpeg stream copy (no re-encode). It keeps the H.264 video and the stereo MP3 audio track, and drops the AC3 5.1 track because Firefox cannot decode AC3. The full download is in `/Users/mrm/Zen-Origin-research/downloads/bbb/`.

Big Buck Bunny, (c) copyright 2008, Blender Foundation, www.bigbuckbunny.org, CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).
