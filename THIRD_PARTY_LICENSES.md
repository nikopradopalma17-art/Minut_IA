# Third-Party Licenses

MinutIA bundles or downloads the following third-party software and models.
The full license texts referenced below are shipped alongside this file in
the `licenses/` directory (also bundled inside the installer).

Contact for license matters: niko_pp_3000@outlook.com

---

## Bundled binaries

### FFmpeg — LGPL v2.1 or later

MinutIA bundles an **LGPL build** of FFmpeg (from the
[BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) project,
`ffmpeg-n8.1 *-lgpl` static builds), redistributed **without modifications**
as a separate executable invoked as an external process.

- License: GNU Lesser General Public License v2.1 or later (some optional
  components under LGPL v3) — see `licenses/LGPL-2.1.txt`,
  `licenses/LGPL-3.0.txt` and `licenses/GPL-3.0.txt`.
- Copyright © 2000–2026 the FFmpeg developers.
- **Corresponding source code**: available from https://ffmpeg.org/download.html
  and, for the exact build configuration used, from the release assets and
  build scripts at https://github.com/BtbN/FFmpeg-Builds. We will additionally
  provide a copy of the corresponding source on request for at least three
  years (contact above).
- FFmpeg is a trademark of Fabrice Bellard, originator of the FFmpeg project.

### llama-helper (bundled sidecar) — statically links llama.cpp / ggml (MIT)

The `llama-helper` executable is built from this repository and statically
links [llama.cpp](https://github.com/ggml-org/llama.cpp) and ggml via the
`llama-cpp-2` Rust bindings.

> MIT License — Copyright (c) 2023-2024 The ggml authors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Statically linked in the main executable

### whisper.cpp / ggml — MIT

Speech-to-text via [whisper.cpp](https://github.com/ggerganov/whisper.cpp),
statically linked through the `whisper-rs` bindings (also MIT).
Copyright (c) 2023-2024 The ggml authors. MIT license text as above.

### ONNX Runtime — MIT

Parakeet transcription and speaker diarization run on
[ONNX Runtime](https://github.com/microsoft/onnxruntime) via the `ort` crate.
Copyright (c) Microsoft Corporation. MIT license text as above.

### Meetily (upstream project) — MIT

MinutIA is based on the open-source project
**Meetily ([meeting-minutes](https://github.com/Zackriya-Solutions/meeting-minutes))
by Zackriya Solutions** — Copyright (c) 2024 Zackriya Solutions, MIT license.
The full text is preserved in this repository's `LICENSE.md` and bundled with
the installer.

## Models downloaded at runtime (not bundled)

| Model | Source | License | Notes |
|---|---|---|---|
| Whisper (ggml weights) | `huggingface.co/ggerganov/whisper.cpp` | MIT (OpenAI Whisper) | Local transcription |
| NVIDIA Parakeet TDT 0.6B v2/v3 | `huggingface.co/istupakov/parakeet-tdt-0.6b-{v2,v3}-onnx` | **CC-BY-4.0** | Original model by **NVIDIA**; ONNX conversion by istupakov. Attribution required and given here. |
| WeSpeaker voxceleb ResNet34 | `huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM` | Apache-2.0 (`licenses/Apache-2.0.txt`) | Speaker diarization |
| Qwen3.5 2B / 4B (GGUF) | `huggingface.co/unsloth/Qwen3.5-{2B,4B}-GGUF` | Apache-2.0 | Local summaries |
| Gemma 3 1B / 4B (GGUF) | `huggingface.co/bartowski/google_gemma-3-{1b,4b}-it-GGUF` | [Gemma Terms of Use](https://ai.google.dev/gemma/terms) | Subject to Google's [Gemma Prohibited Use Policy](https://ai.google.dev/gemma/prohibited_use_policy) |

Models are downloaded on demand by the user and stored locally; their use is
subject to the licenses/terms listed above.

## Rust and JavaScript dependencies

The application also uses open-source Rust crates and npm packages under
permissive licenses (MIT, Apache-2.0, BSD, ISC). Their license declarations
are available in `Cargo.toml` / `package.json` and each dependency's
repository.
