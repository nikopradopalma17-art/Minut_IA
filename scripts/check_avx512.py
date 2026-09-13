#!/usr/bin/env python3
"""Fail the build if a binary contains statically-baked AVX-512 code.

v1.0.0 shipped AVX-512 instructions baked by GGML_NATIVE=ON (whisper.cpp) and
by pykeio's prebuilt onnxruntime; consumer CPUs (Intel 11th-gen+, AMD Zen1-3)
crashed with 0xC000001D on launch. This gate scans for EVEX-prefixed
instructions so a regression fails CI instead of users.

What this gate does and does not catch:
- .lib static libraries (ggml/whisper via --raw-style auto detection) and
  executables without runtime-dispatched SIMD must have ~zero EVEX: the
  portable builds measure <=17 hits per 64 KiB window.
- Executables that legitimately contain runtime-dispatched AVX-512 (e.g.
  rustfft compiles its backend unconditionally but calls it only after
  is_x86_feature_detected) are scanned with a higher --max-window threshold
  calibrated between dispatch kernels (~hundreds) and contiguous baked
  kernels (>=1800: pykeio ort 1800, baked ggml 2662 in v1.0.0).
- ffmpeg.exe and the official onnxruntime dll are excluded from scanning:
  they carry runtime ISA dispatch by design.

A lone 0x62 byte can appear in any byte stream, so density is required:
windows with more EVEX-looking sites than the limit fail.
"""

import struct
import sys

WINDOW = 64 * 1024
DEFAULT_MAX_WINDOW = 100  # hits per 64 KiB window considered noise


def load_text_section(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:2] != b"MZ":
        # Static library archive (.lib/.a): scan raw bytes. Object-file data
        # adds low-level noise well below the fail thresholds.
        return data, 0
    e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
    if data[e_lfanew : e_lfanew + 4] != b"PE\0\0":
        raise ValueError(f"{path}: bad PE signature")
    coff = e_lfanew + 4
    nsec = struct.unpack_from("<H", data, coff + 2)[0]
    opt_size = struct.unpack_from("<H", data, coff + 16)[0]
    sec_off = coff + 20 + opt_size
    for i in range(nsec):
        o = sec_off + i * 40
        name = data[o : o + 8].rstrip(b"\0").decode(errors="replace")
        vsize, vaddr, rawsize, rawptr = struct.unpack_from("<IIII", data, o + 8)
        if name == ".text":
            return data[rawptr : rawptr + min(vsize, rawsize)], vaddr
    raise ValueError(f"{path}: no .text section")


def evex_sites(text):
    """Offsets of EVEX-prefixed instruction candidates (62 with a valid P1 byte).

    EVEX P1 (the byte after 0x62) packs R/X/B/R' into the low nibble and must
    be 0xF0-0xFF; plain data bytes rarely pair like this back to back.
    """
    sites = []
    i = 0
    n = len(text)
    while i < n - 1:
        if text[i] == 0x62 and 0xF0 <= text[i + 1] <= 0xFF:
            sites.append(i)
            i += 4  # skip past the 4-byte prefix so one insn counts once
        else:
            i += 1
    return sites


def check(path, max_window=DEFAULT_MAX_WINDOW):
    text, vaddr = load_text_section(path)
    sites = evex_sites(text)
    worst = 0
    worst_rva = 0
    for start in range(0, len(text), WINDOW):
        hits = [s for s in sites if start <= s < start + WINDOW]
        if len(hits) > worst:
            worst = len(hits)
            worst_rva = vaddr + start
    total_mb = len(text) / (1024 * 1024)
    if worst > max_window:
        print(
            f"FAIL {path}: {len(sites)} EVEX (AVX-512) candidate sites "
            f"({total_mb:.1f} MB); densest 64 KiB window at RVA {worst_rva:#x} "
            f"has {worst} hits (limit {max_window}).\n"
            f"      If this is a final executable, the binary will crash with "
            f"0xC000001D on CPUs without AVX-512 (all consumer Intel 11th-gen+,\n"
            f"      AMD Zen1-3) unless the code is runtime-dispatched. Check "
            f"GGML_NATIVE=OFF in local-crates/whisper-rs-sys/build.rs and the\n"
            f"      ort load-dynamic feature in frontend/src-tauri/Cargo.toml."
        )
        return 1
    print(
        f"OK   {path}: {len(sites)} EVEX candidates, densest "
        f"64 KiB window {worst} hits <= {max_window}."
    )
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    max_window = DEFAULT_MAX_WINDOW
    if "--max-window" in args:
        i = args.index("--max-window")
        max_window = int(args[i + 1])
        del args[i : i + 2]
    if not args:
        print(
            f"usage: {sys.argv[0]} [--max-window N] <binary-or-lib> [...]",
            file=sys.stderr,
        )
        sys.exit(2)
    failures = [p for p in args if check(p, max_window)]
    sys.exit(1 if failures else 0)
