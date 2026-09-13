#!/usr/bin/env python3
"""Fail the build if a Windows PE executable contains AVX-512 code.

v1.0.0 shipped AVX-512 instructions baked by GGML_NATIVE=ON on an AVX-512
capable CI runner; consumer CPUs (Intel 11th-gen+, AMD Zen1-3) crashed with
0xC000001D on launch. This gate scans .text for EVEX-prefixed instructions
so a regression fails CI instead of users.

Heuristic: a lone 0x62 byte can appear in any byte stream, so we require
density — any 64 KiB window with more EVEX-looking sites than NOISE_LIMIT
is treated as real AVX-512 code. Hand-verified against the v1.0.0 binary:
its ggml regions show 400+ hits/64 KiB; random code measures 10-25.
"""

import struct
import sys

WINDOW = 64 * 1024
NOISE_LIMIT = 100  # hits per 64 KiB window considered real AVX-512 code


def load_text_section(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:2] != b"MZ":
        raise ValueError(f"{path}: not a PE file")
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


def check(path):
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
    if worst > NOISE_LIMIT:
        print(
            f"FAIL {path}: {len(sites)} EVEX (AVX-512) candidate sites in .text "
            f"({total_mb:.1f} MB); densest 64 KiB window at RVA {worst_rva:#x} "
            f"has {worst} hits (noise threshold {NOISE_LIMIT}).\n"
            f"      The binary will crash with 0xC000001D on CPUs without "
            f"AVX-512 (all consumer Intel 11th-gen+, AMD Zen1-3).\n"
            f"      Check GGML_NATIVE=OFF in local-crates/whisper-rs-sys/build.rs "
            f"and any other native-compiled dependency."
        )
        return 1
    print(
        f"OK   {path}: {len(sites)} EVEX candidates (noise level), densest "
        f"64 KiB window {worst} hits <= {NOISE_LIMIT}. No AVX-512 code detected."
    )
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"usage: {sys.argv[0]} <executable.exe> [more.exe ...]", file=sys.stderr)
        sys.exit(2)
    failures = [p for p in sys.argv[1:] if check(p)]
    sys.exit(1 if failures else 0)
