# Elvo: agent instructions

Read this file, `README.md`, and `DESIGN.md` before changing the project. Inspect the relevant implementation rather than treating documentation as proof of current behavior.

## Product and scope

Elvo (formerly Dilmanc) is a browser-based, limited-vocabulary sign recognition prototype for a clinic reception scenario in Azerbaijan. Users record labeled landmark sequences, train a small classifier, recognize signs through a webcam, compose predefined Azerbaijani phrases, and speak them aloud through Azure Azerbaijani Neural TTS. The hearing person can reply by speech recognition, typed text, or quick replies.

This is not a general sign language translator, a medical device, or a replacement for a qualified interpreter. Do not introduce claims of universal vocabulary, perfect accuracy, clinical reliability, or guaranteed training speed.

## Working agreements

- Write repository documentation and commit messages in English.
- Use Conventional Commits with an appropriate scope: `feat(ui): ...`, `fix(dataset): ...`, `docs(agent): ...`, or `chore(deps): ...`.
- Do not use the em dash character in new code, documentation, UI text, or commit messages.
- Keep changes focused. Do not migrate the stack, introduce a build system, add a backend, or redesign the app unless requested.
- Preserve existing datasets, vocabulary, model storage, and saved preferences. Ask before destructive data migrations or history rewrites.
- Do not publish participant datasets, camera captures, speech transcripts, or identifiable signer information in commits, tests, screenshots, or logs.
- Keep the interface terse. Do not restore the removed camera/model/voice readiness indicators, FPS badge, sidebar summary, privacy slogan, or a persistent "Voice: ..." status.
- Never print, commit, or send the Azure key to the browser. It belongs only in the ignored `.env` file or the server process environment.
- Do not merge, deploy, force-push, or rewrite history without explicit authorization. Never assume a previous approval covers a new destructive action.

## Run locally

There is no build step or frontend framework. `server.py` is a Python standard-library server (Python 3.10+) that serves the app and proxies speech synthesis to Azure.

```sh
sh scripts/vendor.sh
python3 server.py --configure   # first run: prompts for Azure region and key
python3 server.py               # later runs
```

Open `http://localhost:8000`. Use localhost for camera access, not `file://`. A plain static server (`python3 -m http.server`, `npx serve`) still runs recognition and training, but it has no `/api/speech/*` endpoints, so speech output fails. There is intentionally no Turkish or browser-voice fallback for output. Chrome or Edge is the recommended demo environment; speech recognition still depends on the browser.

For interface checks without requesting the camera:

```text
http://localhost:8000/?nocam
```

`?nocam` skips camera startup. It does not bypass the normal dependency loading or provide fake inference, a trained model, or a dataset. Without Azure credentials, the settings view shows one actionable setup message; that is expected.

Optional local dependency download:

```sh
sh scripts/vendor.sh
```

`vendor/` is ignored by Git. Do not commit downloaded models, WASM files, or library bundles.

## Architecture and change map

| File | Responsibility |
| --- | --- |
| `index.html` | Four application views, semantic controls, static translation markers, inline Elvo logo |
| `assets/` | Elvo logo and mark as standalone SVG files for documentation; not served by `server.py` |
| `css/app.css` | Shared tokens, layout, components, responsive and projector modes |
| `server.py` | Localhost-only static server, Azure TTS proxy, disk audio cache, `--configure` prompt |
| `js/main.js` | Boot, application state, view rendering, recording, inference flow, training orchestration, import/export |
| `js/temporal.js` | Time-based resampling of the one-second window and the recognition gate |
| `js/i18n.js` | AZ/EN interface dictionary, interpolation, active text bindings, locale persistence |
| `js/vision.js` | Camera, MediaPipe loading, hand/pose landmarks, rolling frame buffer, overlays |
| `js/features.js` | Feature schema, sample stacking, augmentation, mirroring |
| `js/model.js` | TensorFlow.js classifier, splits, training, evaluation, confusion matrix, persistence, model bundles |
| `js/store.js` | IndexedDB samples, JSON dataset interchange, ID-based upserts |
| `js/vocab.js` | Default signs, background class, phrase rules, vocabulary persistence |
| `js/speech.js` | Azure voice selection and playback client, browser speech recognition |
| `js/charts.js` | Canvas evaluation charts and chart rendering helpers |
| `scripts/vendor.sh` | Download pinned browser dependencies and landmark models |
| `tests/*.test.js`, `tests/i18n.test.mjs` | Node tests: temporal gate, datasets, model, speech client, translations |
| `tests/test_server.py` | Python tests for the speech server and static file restrictions |
| `tests/ui-smoke.cjs`, `tests/load-tf.cjs` | jsdom UI workflow test and the TensorFlow.js loader for tests |

`main.js` imports ES modules directly. TensorFlow.js is loaded as the global `tf` before `model.js` is dynamically imported. Keep that ordering.

Dependency versions currently used:

- TensorFlow.js: `4.22.0`.
- MediaPipe Tasks Vision: `0.10.14`.
- Hand Landmarker and Pose Landmarker Lite task assets.

If changing versions, update both runtime URLs and `scripts/vendor.sh`, then test CDN fallback and local loading.

## Data contracts: preserve compatibility

### Samples and features

- `T = 30` frames and `D = 134` features per frame. Frames are resampled by timestamp from a one-second window (`WINDOW_MS = 1000`), so capture length does not depend on camera FPS. Windows with fewer than 8 frames or gaps over 250 ms are rejected.
- A sample's `data` is a `Float32Array` of length `4020` at runtime.
- Sample fields are `{ id, sign, signer, data, at }`; `at` is an ISO timestamp. New recordings also store `handFrames`, `durationMs`, and `rawFrames`.
- The first two frame features encode nose position relative to the shoulder midpoint.
- Two 66-feature hand slots follow: right, then left. Each contains presence, relative wrist position, and 21 wrist-relative 3D landmarks.
- Mirroring swaps hand slots and negates horizontal coordinates. Display mirroring alone is not equivalent to feature mirroring.
- Augmentation belongs to training data only. Never augment validation data or leak validation samples into training before evaluation.

Changing dimensions, feature order, normalization, or hand-slot semantics can invalidate saved samples and models. Design an explicit compatibility strategy before doing so.

### Persistence and interchange

The project was renamed from Dilmanc to Elvo. Every persisted identifier below keeps the `dilmanc` prefix on purpose: renaming one makes existing samples, models, preferences, cached audio, or teammates' exports appear missing or invalid. Change user-visible names only, unless a migration is explicitly requested.

| Location/key | Content |
| --- | --- |
| IndexedDB database `dilmanc`, store `samples` | Landmark samples keyed by `id` |
| TensorFlow.js `indexeddb://dilmanc-model` | Trained model |
| localStorage `dilmanc.model.v1` | Model metadata |
| localStorage `dilmanc.vocab.v1` | Editable signs and composition rules |
| localStorage `dilmanc.language` | Interface locale, `az` or `en` |
| localStorage `dilmanc.azure.voice` | Selected Azure voice, `az-AZ-BanuNeural` or `az-AZ-BabekNeural` |
| localStorage `dilmanc.threshold` | Confidence threshold as a percentage |

| `.env` (ignored) | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |
| `.dilmanc-cache/tts/` (ignored) | Cached MP3 audio keyed by voice and text |

Storage is origin-specific. Changing host or port can make existing browser data appear missing; that does not prove deletion. Before moving to another computer, browser profile, host, or port, export the dataset. Model bundles import on another computer without retraining. Audio caches are not part of either export; copy `.dilmanc-cache/` separately.

Dataset exports use `format: "dilmanc-dataset"` and `version: 1`, with `exportedAt`, `vocab`, and `samples`. Typed arrays become numeric arrays in JSON and are restored on import.

Imports are validated before anything is written: vocabulary shape and IDs, known classes, non-empty signer names, `T * D` finite numbers, and unique IDs. Import uses ID-based replacement, not append-only insertion. An existing sample ID must update the stored sample so corrected signer labels do not create duplicates. Keep unknown sample identities distinct.

Trained models can be exported as a single `format: "dilmanc-bundle"`, `version: 1` JSON file containing topology, weights, class order, vocabulary, and evaluation metadata. Treat imported bundles as untrusted: validate shapes and classes, and keep only typed metadata before rendering it.

The reserved background class ID is `_fon`. Do not rename it or translate it in persisted data. Vocabulary sign IDs also act as foreign keys in samples, model classes, and phrase-rule sequences.

## Localization

The interface supports Azerbaijani and English. The selected interface language does not change the sign vocabulary, spoken phrases, or `az-AZ` speech recognition language.

- Azerbaijani source strings are dictionary keys in `js/i18n.js`.
- Use `data-i18n` on static leaf text nodes in HTML.
- Use `t(key, params)` for generated labels and formatted messages.
- Use `ui(element, key, params)` for active logs, errors, and messages that must update when the locale changes.
- Use `data-i18n-placeholder` for translated input placeholders.
- Module and server errors use Azerbaijani messages as keys. When a message has parameters, attach `error.key` and `error.params` (the server returns `key` and `params` in JSON) and display it through `errorKey`/`errorText` in `main.js`.
- Do not put translation bindings on containers with nested controls: translation sets `textContent` and would remove children.
- Keep user-entered vocabulary, signer names, and speech transcripts out of translation bindings.
- Use the current `locale()` for number, percentage, and time formatting.
- Switching language must not reset the camera, erase samples, replace vocabulary, or discard the trained model.
- Speech output offers only the Azure Azerbaijani voices Banu and Babek. Do not add Turkish voices.
- Keep speech latency low: `commit()` prefetches the composed phrase during the auto-speak pause, startup warms vocabulary and rule phrases for the current voice, and `server.py` reuses HTTPS connections to Azure. Playback reuses one unlocked `Audio` element; do not create a new element per phrase. Speech rate and pauses are `SPEECH_RATE` and `PAUSES` in `server.py`; they are part of the audio cache key.
- Live recognition keeps evaluating for `HAND_TAIL_MS` after hands leave, because the last sign of a sequence often ends as the hands drop. Do not return early on frames without hands.

## Recognition and evaluation

The recognizer smooths predictions and filters them by confidence. Phrase composition uses longest matching predefined rules, not a generative translation model.

Background examples should include non-signing behavior such as resting hands, ordinary gestures, and object handling. Do not turn background predictions into spoken signs.

Validation supports a random per-class split and a held-out signer mode. The final model is subsequently trained on all samples. Keep held-out evaluation results distinct from that final training run.

Signer names must describe the actual signer. Do not invent mappings or infer identities from timestamps. Incorrect signer labels invalidate claims about unseen-person performance.

Report sample counts, class coverage, and split method with accuracy. A random split can be optimistic; mirroring and a high confidence score are not evidence of accuracy on new signers.

## Privacy and connectivity

Landmark processing and model training happen in the browser; this implementation does not upload video to an application server. That does not make the complete experience offline or entirely local:

- Dependencies can load from CDNs when local copies are absent.
- Google Fonts requests external resources.
- New speech text is sent by the local server to Azure. Cached audio stays in `.dilmanc-cache/`.
- Browser speech recognition may use remote services.

Keep these distinctions in documentation, not as persistent reassuring UI slogans. Do not add network transmission of participant data without explicit authorization.

## Documentation

`README.md` is the public front page for visitors: what Elvo is, how it works, how to run it, privacy, limitations, and the team. Keep contributor and agent material here in `AGENTS.md` instead: conventions, the file map, data contracts, verification commands, and demo guidance. Do not duplicate it in the README; link to this file.

- README visuals live in `assets/readme/`. The animated GIFs are rendered from the team's pitch deck, which is not part of this repository; replace them as files rather than editing them.
- README media must not contain camera captures, participant data, or identifiable signers. The pitch video includes a real webcam recording, so it is not committed; embed it only through a GitHub web upload with the owner's consent.
- Light and dark variants are paired with `<picture>` and `prefers-color-scheme`. Keep both when changing one.
- Keep README claims inside the product scope above: no accuracy figures unless they come from a reported evaluation with sample counts, classes, and split method.

### Demo guidance

For a three-minute live demo:

1. **Problem, 30 seconds:** the communication barrier at a clinic reception.
2. **Live interaction, 90 seconds:** for example `salam`, `baş`, `ağrı`, and `dərman`, followed by a spoken reply shown as text.
3. **Evidence, 30 seconds:** the actual evaluation method, sample counts, and per-class results.
4. **Adaptability, 30 seconds:** custom vocabulary; record or retrain live only if it reliably fits the time.

Prepare a backup recording. Do not promise a fixed training time or perfect accuracy.

## Verification

From the repository root, after `sh scripts/vendor.sh`:

```sh
npm test                 # Node.js 20+
npm run test:server      # Python server tests
npm install && npm run test:ui   # jsdom UI workflow
for file in js/*.js; do node --check "$file" || exit 1; done
```

`package.json` uses `"type": "module"`; load TensorFlow.js in tests through `tests/load-tf.cjs`, not `require('vendor/tf.min.js')`. Node.js is for checks only, not an application runtime requirement. Tests use synthetic features and mocked Azure audio; they do not prove live speech or recognition accuracy.

For UI changes, serve the app and check all four views at 390, 768, and 1440 px. Verify:

- AZ/EN switches static labels, dynamic controls, messages, errors, and chart legends.
- The selected locale survives reload.
- Sample counts, vocabulary, phrases, and stored model survive language switching.
- Tables scroll within their containers; the whole page does not overflow horizontally.
- The mobile menu opens, closes, and navigates correctly.
- Projector mode and keyboard shortcuts still work.
- Permission/loading/error overlays remain readable; removed readiness indicators stay absent.
- The Azure setup message appears only when the server is unreachable, unconfigured, or a request fails.
- No runtime exceptions appear in the browser console.

Use isolated browser storage for automated fixtures. Never clear a person's real dataset to make a test pass.

Changes to vision, features, inference, or training also need camera and real-sign testing appropriate to the change. A passing translation test or a mock browser model does not establish recognition accuracy.

Useful existing shortcuts: Space records in the recording view; Enter speaks in the live view; Backspace removes the last pending sign; Escape exits projector mode. Do not hijack typing inside form fields.

## Completion checklist

- Implement only the requested change and preserve data contracts.
- Follow `DESIGN.md` and localize new interface text.
- Run applicable checks and distinguish automated checks from real camera/audio tests.
- Update English documentation if behavior or setup changes.
- Review the diff for participant data, generated dependencies, credentials, and unrelated edits.
- Use an English Conventional Commit; explain what remains unverified.
