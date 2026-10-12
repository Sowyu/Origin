# Source this before any npm, surfer or mach command: . scripts/env.sh
# Puts the pinned toolchains first: Node 22, Python 3.11, Rust 1.95.0 (rustup in ~/.cargo),
# GNU tar and xz. They live in ../Zen-Origin-research/tools, outside git.
ORIGIN_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]:-${(%):-%x}}")" rev-parse --show-toplevel)"
ORIGIN_RESEARCH="$(cd "$ORIGIN_ROOT/.." && pwd)/Zen-Origin-research"
export ORIGIN_ROOT ORIGIN_RESEARCH
export PATH="$ORIGIN_RESEARCH/tools/bin:$ORIGIN_RESEARCH/tools/node22/bin:$HOME/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin"
# Release options without LTO and PGO (configs/common/mozconfig, configs/macos/mozconfig).
# ZEN_RELEASE also picks MacOSX26.5.sdk from /Library/Developer/CommandLineTools/SDKs.
export ZEN_RELEASE=1 ZEN_DISABLE_LTO=1 ZEN_GA_DISABLE_PGO=1
export SURFER_PLATFORM=darwin
export CARGO_INCREMENTAL=0
# Surfer commits the pristine Firefox tree in engine/ and silently skips the commit without an
# identity, which later breaks mach. These commits stay local.
export GIT_AUTHOR_NAME="Zen Origin build" GIT_AUTHOR_EMAIL="build@zen-origin.invalid"
export GIT_COMMITTER_NAME="Zen Origin build" GIT_COMMITTER_EMAIL="build@zen-origin.invalid"
