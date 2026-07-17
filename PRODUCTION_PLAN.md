# MinutIA — Plan maestro de producción

> Estado al 2026-07-17, rama `feature/new-spa-interface` (working tree sin commitear). Consolida: auditorías originales (seguridad/updater/build), la ejecución del plan de fixes, el re-review post-fixes y las 3 auditorías finales (legal, upgrade de datos, robustez runtime). Cada ítem pendiente lleva spec ejecutable.

## Resumen ejecutivo

El grueso del plan original está **ejecutado y verificado**: compila (`cargo check` 0 errores), 81/81 tests pasan, código muerto eliminado (~31k líneas), updater cableado y documentado (`RELEASING.md`), versión 1.0.0 consistente. Lo que queda para `v1.0.0` se agrupa así:

| Frente | Ítems | Gravedad |
|---|---|---|
| **A. Bloqueantes de código** | ✅ Ejecutados 2026-07-17 (commits `fde96ad0`, `37e55902`) | Crítico |
| **B. Bloqueante legal** | ✅ Ejecutado: ffmpeg LGPL (BtbN n8.1) + THIRD_PARTY_LICENSES bundleado | Bloqueante-legal |
| **C. Importantes pre-release** | R2 ✅, R3 ✅; quedan RT4–RT6, L4 (Lote B) | Importante |
| **D. Acciones del dueño** | ✅ resueltas 2026-07-17; quedan: PR/merge tras Lote A, release+publish, e2e v1.0.1 | Manual |
| **E. Backlog post-release** | ver §8 | No bloqueante |

## 1. Completado — semana previa

| Ítem | Estado | Referencia |
|---|---|---|
| Inyección de comandos en `open_external_url` | ✅ | `api.rs:1134` — allowlist http/https + crate `open` |
| Permisos `fs:read-all`/`write-all` amplios | ✅ | `tauri.conf.json` — solo sets con scope |
| API keys LLM plaintext en SQLite | ✅ | `setting.rs` — keychain del OS vía `keyring` |
| 4.2 GB de caché Rust commiteados | ✅ | amend (`4ab0f2cf`) + `**/target-*/` en `.gitignore` |
| `[profile.release]` (LTO, strip) | ✅ | `Cargo.toml` |
| Regla identifier congelado + estado code signing | ✅ | `CLAUDE.md` §Gotchas 8-9 |

**Contexto decidido:** no hay usuarios reales todavía; `com.minutia.app` queda congelado desde el primer release. Release `v1.0.0` = Windows-only, sin firma de código (SmartScreen avisará), analytics apagado.

## 2. Completado — ejecución del plan de fixes (2026-07-16)

<details><summary>22 ítems ejecutados y verificados por re-review (expandir)</summary>

F1.1 confinamiento de rutas (con regresión R1, ver §3) · F1.2 migración keyring one-shot (con gap R3) · F1.3 https + CSP sin puertos legacy (con gap R2) · F3.1 borrado de `backend/`, `audio_v2/`, huérfanos de audio/whisper, subsistema paralelo, deps npm muertas, invokes rotos, workflows de test · F4.1 privacy policy MinutIA + link corregido · F2.1 bump 1.0.0 ×3 manifiestos · F2.2 release.yml fail-duro · F2.4 `RELEASING.md` · F5 `removeConsole` + `.gitignore` `.env*`/`*.key` · F2.3 par de firma regenerado (pubkey key ID `6C3DDCBD59D700D4`; secrets reportados como configurados — **confirmar**, §7.2)

Verificación: `cargo check` exit 0 (13 warnings) · `pnpm test` 81/81 · `pnpm build` OK · cero referencias colgantes a módulos borrados · cero links a Zackriya en código user-facing.
</details>

---

## 3. Re-review de los fixes (2026-07-17) — corregir antes del release

### R1 — ✅ RESUELTO (`fde96ad0`) — El confinamiento de rutas rompía la reproducción de grabaciones
`resolve_within_allowed` (`lib.rs`) solo permite `app_data_dir` y `download_dir`, pero las grabaciones van por defecto a `%USERPROFILE%\Music\MinutIA-recordings` (`recording_preferences.rs:43-55`) y son configurables a cualquier carpeta. `useAudioPlayer.ts:76` lee con `invoke('read_audio_file')` → **"Access denied" al reproducir cualquier grabación**.
**Spec:** agregar a `allowed_roots` la carpeta configurada (`load_recording_preferences(app).save_folder`) y `get_default_recordings_folder()`, ambas canonicalizadas igual que las otras raíces. Test: reproducir una grabación en la carpeta default y en una custom. Corregir también `RELEASING.md` Phase D-2 (dice `%APPDATA%\com.minutia.app\recording-*.wav`; la ruta real es Music).

### R2 — ✅ RESUELTO (`fde96ad0`) — Validación de endpoint custom-OpenAI bypasseable
`api.rs:1180` y `:1283`: `starts_with("http://localhost")` acepta `http://localhost.evil.com`, `http://127.0.0.1.evil.com`, `http://localhost@evil.com` → API key en claro (`Bearer`) a host remoto vía `llm_client.rs:173-180` (sin re-validación).
**Spec:** helper compartido con `url::Url::parse` (ya es dependencia): permitir `https`, o `http` solo si `host()` es exactamente `Domain("localhost")`, IPv4 en `127.0.0.0/8` o IPv6 `::1` (esto además arregla que `http://[::1]:8000` legítimo hoy sea rechazado). Aplicar en ambos comandos + test unitario con los bypasses.

### R3 — ✅ RESUELTO (`fde96ad0`) — La migración keyring marcaba "done" aunque hubiera fallos
`setting.rs` (~490): tras el loop, `UPDATE settings SET keyringMigrationDone = 1` corre **incondicionalmente**; si `keyring_set` falló en alguna key (`continue`), esa key queda plaintext para siempre y el "retry" del comentario nunca ocurre.
**Spec:** acumular `had_failures: bool` en los tres bloques (settings, customOpenAIConfig, transcript_settings); marcar el flag solo si `!had_failures`. Test con keyring simulado que falla.

---

## 4. Auditoría legal y licencias

### L1 — ✅ RESUELTO (`37e55902`) — ffmpeg ahora es build LGPL de BtbN (n8.1, verificado sin --enable-gpl); el build script rechaza binarios GPL
`tauri.conf.json` bundlea `binaries/ffmpeg` como `externalBin`. El binario Windows actual viene de `ffmpeg-8.0.1-essentials_build.zip` (`build/ffmpeg.rs:127-129`, build gyan.dev = **GPL v3**) sin texto de licencia ni oferta de fuentes. (Uso como sidecar = "mera agregación"; NO contagia al código MIT propio.)
**Spec (decisión del dueño 2026-07-17: build LGPL):**
1. Cambiar las URLs de descarga en `build/ffmpeg.rs:127-145` a un build **LGPL** de BtbN (`ffmpeg-master-latest-win64-lgpl.zip` o release pinneada `-lgpl` de https://github.com/BtbN/FFmpeg-Builds/releases); verificar que la app solo usa funcionalidad disponible en LGPL (encode AAC/mux mp4 — sí lo está; los codecs GPL como libx264 no se usan).
2. En `THIRD_PARTY_LICENSES.md` (ver L2/L3): texto **LGPL v2.1+** + declaración "FFmpeg (build LGPL de BtbN), sin modificaciones, redistribuido como ejecutable separado" + link a las fuentes (ffmpeg.org y el repo de BtbN, que publica las fuentes exactas por release).
3. Verificar en máquina real que el pipeline de guardado (checkpoint → merge → mp4) funciona igual con el binario BtbN.

### L2 — ✅ RESUELTO (`37e55902`, ajustado por decisión del dueño 2026-07-17) — licencias bundleadas SIN atribución pública
La MIT de Meetily (`LICENSE.md`, © 2024 Zackriya Solutions — correctamente conservado) exige el aviso "in all copies"; `bundle.resources` (`tauri.conf.json:98-100`) solo incluye `templates/*.json` → el `.exe`/`.msi` no lleva licencia.
**Decisión del dueño:** MinutIA se presenta como creación propia — sin atribución pública al proyecto original en README, docs ni UI (la MIT lo permite). **Línea legal inamovible:** el aviso de copyright original dentro de `LICENSE.md` se conserva y se bundlea en el instalador (la MIT lo exige en toda copia; quitarlo = infracción con riesgo de DMCA sobre el repo/release). Se añadió el copyright propio (Impulso IA 2026) encima del original — práctica estándar en derivados. Toda otra mención pública fue purgada (README, THIRD_PARTY_LICENSES.md, docs/, imagen Meetily-6.png).

### L3 — ✅ RESUELTO (`37e55902`) — THIRD_PARTY_LICENSES.md creado con todos los avisos
whisper.cpp/ggml (MIT, "The ggml authors" — enlazado estático en el binario principal) · llama.cpp/ggml vía `llama-cpp-2` (MIT — estático en `llama-helper.exe`) · ONNX Runtime/`ort` (MIT, Microsoft) · WeSpeaker voxceleb (Apache-2.0) · pesos Whisper (MIT, OpenAI).

**Licencias de modelos verificadas online en HuggingFace (2026-07-17):**
| Modelo | Repo HF | Licencia declarada | Obligación |
|---|---|---|---|
| Parakeet TDT 0.6B v2/v3 ONNX | `istupakov/parakeet-tdt-0.6b-v2-onnx` / `-v3-onnx` | **cc-by-4.0** (original: NVIDIA) | Atribución: "NVIDIA Parakeet TDT 0.6B, CC-BY-4.0, conversión ONNX por istupakov" |
| Qwen3.5 2B / 4B GGUF | `unsloth/Qwen3.5-2B-GGUF` / `-4B-GGUF` | **apache-2.0** | Aviso Apache-2.0 en créditos |
| Gemma 3 1B / 4B GGUF | `bartowski/google_gemma-3-1b-it-GGUF` / `-4b-it-GGUF` | **gemma** (Gemma Terms of Use; el 1B lo declara explícito, el 4B es el mismo modelo base) | Enlazar Gemma Terms of Use + Prohibited Use Policy en créditos |

### L4 — MENOR — Ajustes a PRIVACY_POLICY.md
Línea 14: matizar "Never transmitted" → el audio nunca sale, pero el **texto** del transcript sí viaja al proveedor LLM elegido (la política ya lo dice en :15 y :67-72; quitar el absoluto). Línea 127: dice "v0.4.0", la app es 1.0.0. Línea 115: reemplazar el email noreply por el buzón real decidido por el dueño: **niko_pp_3000@outlook.com**.

---

## 5. Auditoría de upgrade de datos

### D1 — ✅ RESUELTO (`fde96ad0`) — Fallo de migración: diálogo + exit (sin panic), backup pre-migración con WAL, migraciones congeladas documentadas (CLAUDE.md §10)
`lib.rs:585-588`: `block_on(initialize_database_on_startup(...)).expect("Failed to initialize database")`. Cualquier migración futura que falle (bug en 1.1.0, I/O) → panic al arrancar, y como sqlx registra las aplicadas, **cada reintento vuelve a fallar**: usuarios auto-actualizados quedan con la app inarrancable, sin mensaje. El recovery existente solo cubre WAL corrupto (`manager.rs:181`), no errores de migración. Downgrade (DB nueva + app vieja) → mismo panic (`VersionMissing`).
**Spec:**
1. Reemplazar `.expect()` por manejo graceful: en `Err`, mostrar diálogo nativo (tauri-plugin-dialog ya está) con el error y opciones *Reintentar / Abrir carpeta de datos / Salir*; no matar el proceso sin diagnóstico.
2. **Backup pre-migración** (barato, de-riesga todo): en `manager.rs` antes de `migrate!().run()`, copiar `meeting_minutes.sqlite` → `meeting_minutes.pre-v{version}.bak` (conservar solo el último).
3. Proceso: documentar en `CLAUDE.md`/`CONTRIBUTING.md` que **las 13 migraciones publicadas en v1.0.0 quedan congeladas** (sqlx verifica checksums; editar una = `VersionMismatch` = boot loop). Ideal: check de CI que falle si un `.sql` existente cambia.

### D2 — MENOR — Borrar `LegacyDatabaseImport.tsx` + `HomebrewDatabaseDetector.tsx`
Código muerto (cero imports; la detección real está inline en `OnboardingContext.tsx:176-214`) y con branding "Welcome to Meetily!". En Windows el import legacy es inexistente por diseño (busca en el app_data nuevo) — aceptable sin usuarios reales; empezar limpio es el comportamiento deseado.

**Verificado OK:** upgrades hacia adelante funcionan (migraciones embebidas, orden por timestamp, DDL aditivo) · primer arranque crea esquema completo con FTS5 degradable a LIKE · migración keyring tolera DB vacía · todos los datos bajo `com.minutia.app` · las grabaciones sobreviven la desinstalación (Music, fuera de AppData).

---

## 6. Auditoría de robustez runtime (Rust)

### RT1 — ✅ RESUELTO (`fde96ad0`) — encode.rs sin panics; errores propagados
`encode.rs:74,76,83,57`: `spawn().expect(...)`, `stdin.take().expect(...)`, `wait_with_output().unwrap()`, `to_str().unwrap()`. Si el antivirus bloquea/cuarentena `ffmpeg.exe` a mitad de reunión (escenario Windows real), la task de checkpoint (lanzada fire-and-forget en `recording_saver.rs:183`) **muere en silencio**: la transcripción sigue, el usuario no nota nada, y el `audio.mp4` deja de construirse.
**Spec:** convertir los 4 a `Result` propagado (`anyhow` + `?`, `to_str()` → `ok_or_else`); guardar el `JoinHandle` de la task de acumulación y emitir evento al frontend si termina anómalamente.

### RT2 — ✅ RESUELTO (`fde96ad0`) — evento `recording-save-failed` + toast EN/ES; errores ya no se enmascaran
Cadena verificada: `add_chunk` falla → solo `error!` (`recording_saver.rs:202-208`) → al parar, `finalize()` falla → `save_recording_only` **traga el `Err` y devuelve `Ok`** (`recording_manager.rs:303-310`) → `stop_recording` emite `recording-stopped` como éxito (`recording_commands.rs:988`). El `.mp4` no existe, los `.checkpoints/` quedan huérfanos (recuperables con `recover_audio_from_checkpoints`, pero el usuario no sabe que debe hacerlo).
**Spec:** nuevo evento `recording-save-failed { folder_path, recoverable: true }`; `save_recording_only` no enmascara el `Err`; en la rama `Ok(Err)` de `stop_recording`, emitir el evento de fallo (con toast en frontend que ofrezca el recovery) en vez de `warn!`.

### RT3 — ✅ RESUELTO (`fde96ad0`) — panic hook global + evento `fatal-panic`
Grep confirmado: cero `set_hook`/`catch_unwind` en `src/`. Un panic en cualquier task de audio desaparece como `JoinError` sin diagnóstico ni aviso.
**Spec:** `std::panic::set_hook` en `run()` que loguee con backtrace y emita evento `fatal-audio-panic` al frontend.

### RT4 — IMPORTANTE — `panic!` explícito al crear el VAD
`pipeline.rs:740-748`: si Silero/ONNX falla al inicializar (dll en cuarentena, OOM) → panic en el comando `start_recording`. **Spec:** `AudioPipeline::new` → `Result`, propagar al comando.

### RT5 — IMPORTANTE — Cola de transcripción unbounded → OOM en reuniones largas
`worker.rs:69`, `recording_manager.rs:72`, `pipeline.rs:880`: `unbounded_channel` en toda la cadena. Whisper más lento que tiempo real (CPU sin GPU, modelo grande) → backlog monótono → OOM en reuniones de 1-2h. **Spec:** monitorear `chunks_queued - chunks_completed`; sobre un umbral, evento de aviso al frontend (sugerir modelo menor); opcional canal acotado.

### RT6 — IMPORTANTE — Envenenamiento en cascada de `RECORDING_MANAGER`
~25 usos de `.lock().unwrap()` en `recording_commands.rs`. Un panic con el lock tomado envenena el mutex → **todos** los comandos de grabación panican hasta reiniciar (ni siquiera se puede parar la grabación en curso). **Spec:** `.unwrap_or_else(|e| e.into_inner())` o `parking_lot::Mutex`; en `attempt_device_reconnect` (`:1297-1306`), soltar el guard antes del `.await`.

### RT7–RT9 — MENOR (post-release)
Divergencia de estado al desconectar device a mitad de grabación (`recording_state.rs:293-324`: el estado interno para, `IS_RECORDING` global sigue true) · `to_str().unwrap()` en `incremental_saver.rs:184,187,318` (rutas no-UTF-8) · `static mut SAMPLE_COUNTER` + `unsafe` en `pipeline.rs:51-58` → `AtomicU64`.

**Verificado OK:** `whisper_engine.rs` (modelo corrupto/no descargado/disco lleno → `Result` limpio) · escritura de transcripts/metadata atómica (temp + rename) · timeouts en `llm_client.rs` · recovery de WAL corrupto en `manager.rs`.

---

## 7. Acciones del dueño — estado 2026-07-17

1. **Commits** — ✅ **Hecho**: `9436d57c` (hardening + purga + rebrand, 93 archivos) y `4f31e48b` (bump 1.0.0 + release.yml fail-duro + RELEASING.md), separados como recomienda `RELEASING.md` §2. **Pendiente**: PR/merge de `feature/new-spa-interface` → `main` **después del Lote A** (además `main` está checkouteado en el worktree principal, no se puede mergear localmente desde aquí).
2. **Secrets de firma** — ✅ **Confirmados por el dueño**: `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` corresponden a la pubkey `6C3DDCBD59D700D4`.
3. **Release + publicar draft** — ✅ Acordado. Ejecutar tras merge a `main`: correr `release.yml` y **publicar** el draft `v1.0.0` (`RELEASING.md` §3-5).
4. **Test e2e del updater** — 📋 **Pendiente de la ejecución del plan**: antes de publicar `v1.0.1` (`RELEASING.md` §6, Phases A-D; máquina Windows con VS Build Tools).
5. **Licencias HuggingFace** — ✅ **Verificadas online** (tabla en L3): Parakeet CC-BY-4.0, Qwen3.5 Apache-2.0, Gemma bajo Gemma Terms of Use.
6. **Decisiones tomadas** — ✅ ffmpeg migra a build **LGPL de BtbN** (spec en L1) · email de contacto para la privacy policy: **niko_pp_3000@outlook.com** (spec en L4).

## 8. Backlog post-release (no bloqueante)

- RT7–RT9 (§6) · D2 si no entró antes (§5) · check de CI de migraciones congeladas (D1-3).
- Analytics: decisión v1.0.0 = apagado. Spec futura: telemetría mínima opt-in con PostHog Cloud US (sin contenido de reuniones, keys ni IDs); considerar Sentry para crash reporting.
- CSP: quitar `https://api.ollama.ai` (el webview no lo usa; verificado — su único fetch es `/logo.png`); evaluar `style-src 'unsafe-inline'`.
- 13 warnings de `cargo check` (dead code: `pipeline.rs:691`, `recording_commands.rs:53`, `defaults.rs:21`).
- Branding residual "Meetily" restante (docs públicos ya purgados 2026-07-17): `frontend/API.md`, `BLUETOOTH_PLAYBACK_NOTICE.md`, `AGENTS.md`/`CLAUDE.md` (rutas `%APPDATA%\Meetily`), env var `MEETILY_LLAMA_HELPER`, prefijos `meetily-*` en `build-*.yml`, componentes muertos LegacyDatabaseImport/HomebrewDatabaseDetector (se van con D2), URL del submódulo whisper.cpp y URLs de ffmpeg macOS en `build/ffmpeg.rs` (técnicas, solo dev). Regla del dueño: cero referencias públicas al proyecto original; la única excepción permitida es el aviso legal en `LICENSE.md`. NO tocar los paths homebrew `/opt/homebrew/var/meetily/` (rutas legacy reales de macOS).
- `cargo audit` + `pnpm audit` en CI; `reqwest` 0.11 → 0.12.
- Purga del historial git (blobs de 4.2 GB des-referenciados) — decisión del dueño.
- macOS: fuera de v1.0.0; requiere notarización + certificado Apple.

## 9. Orden de ejecución sugerido

1. **Lote A — ✅ EJECUTADO 2026-07-17** (commits `fde96ad0` seguridad/confiabilidad y `37e55902` legal). Verificado: `cargo check --tests` 0 errores, `pnpm test` 81/81, `pnpm build` OK, ffmpeg LGPL descargado y validado end-to-end. Nota: los tests unitarios Rust nuevos compilan pero no pueden ejecutarse en esta máquina (linker MSVC desactualizado vs STL de whisper_rs_sys) — correrán en CI/máquina real.
2. **Lote B — importantes** (puede entrar en v1.0.0 si hay tiempo, si no v1.0.1): RT4, RT5, RT6, L4 (incluye email niko_pp_3000@outlook.com), D2.
3. **Lote C — dueño (restante)**: PR/merge `feature/new-spa-interface` → `main` tras Lote A → correr `release.yml` → **publicar** el draft `v1.0.0` → e2e del updater antes de `v1.0.1`. (Commits, secrets, licencias y decisiones: ✅ hechos, ver §7.)
4. **Lote D — backlog**: §8 tras el release.

## 10. Verificación

- Por fix: test unitario donde aplique (R1 rutas, R2 bypasses, R3 keyring fallido, D1 migración que falla, RT2 disco lleno simulado).
- Global: `cargo check` (0 errores), `pnpm test` (≥81), `pnpm build`.
- En máquina real (pre-tag): `pnpm run tauri:build`, smoke test `RELEASING.md` Phase D **incluyendo reproducir una grabación** (valida R1) y un stop con disco casi lleno (valida RT2).
