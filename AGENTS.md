# Dilmanc: agent instructions

Read this file, `README.md`, and `DESIGN.md` before changing the project. Inspect the relevant implementation rather than treating documentation as proof of current behavior.

## Product and scope

Dilmanc is a browser-based, limited-vocabulary sign recognition prototype for a clinic reception scenario in Azerbaijan. Users record labeled landmark sequences, train a small classifier, recognize signs through a webcam, compose predefined Azerbaijani phrases, and speak them aloud. A speech-to-text panel displays the hearing person's reply.

This is not a general sign language translator, a medical device, or a replacement for a qualified interpreter. Do not introduce claims of universal vocabulary, perfect accuracy, clinical reliability, or guaranteed training speed.

## Working agreements

- Write repository documentation and commit messages in English.
- Use Conventional Commits with an appropriate scope: `feat(ui): ...`, `fix(dataset): ...`, `docs(agent): ...`, or `chore(deps): ...`.
- Do not use the em dash character in new code, documentation, UI text, or commit messages.
- Keep changes focused. Do not migrate the stack, introduce a build system, add a backend, or redesign the app unless requested.
- Preserve existing datasets, vocabulary, model storage, and saved preferences. Ask before destructive data migrations or history rewrites.
- Do not publish participant datasets, camera captures, speech transcripts, or identifiable signer information in commits, tests, screenshots, or logs.
- Keep the interface terse. Do not restore the removed camera/model/voice readiness indicators, FPS badge, sidebar summary, or privacy slogan.
- Do not merge, deploy, force-push, or rewrite history without explicit authorization. Never assume a previous approval covers a new destructive action.

## Run locally

There is no package manifest, build step, framework, or application server.

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. Use HTTPS or localhost for camera access, not `file://`. Chrome or Edge is the recommended demo environment; speech features depend on browser and operating system support.

For interface checks without requesting the camera:

```text
http://localhost:8000/?nocam
```

`?nocam` skips camera startup. It does not bypass the normal dependency loading or provide fake inference, a trained model, or a dataset.

Optional local dependency download:

```sh
sh scripts/vendor.sh
```

`vendor/` is ignored by Git. Do not commit downloaded models, WASM files, or library bundles.

## Architecture and change map

| File | Responsibility |
| --- | --- |
| `index.html` | Four application views, semantic controls, static translation markers |
| `css/app.css` | Shared tokens, layout, components, responsive and projector modes |
| `js/main.js` | Boot, application state, view rendering, recording, inference flow, training orchestration, import/export |
| `js/i18n.js` | AZ/EN interface dictionary, interpolation, active text bindings, locale persistence |
| `js/vision.js` | Camera, MediaPipe loading, hand/pose landmarks, rolling frame buffer, overlays |
| `js/features.js` | Feature schema, sample stacking, augmentation, mirroring |
| `js/model.js` | TensorFlow.js classifier, split, training, evaluation, inference, persistence |
| `js/store.js` | IndexedDB samples, JSON dataset interchange, ID-based upserts |
| `js/vocab.js` | Default signs, background class, phrase rules, vocabulary persistence |
| `js/speech.js` | Voice selection, Azerbaijani synthesis and speech recognition |
| `js/charts.js` | Canvas evaluation charts and chart rendering helpers |
| `scripts/vendor.sh` | Download pinned browser dependencies and landmark models |
| `tests/i18n.test.mjs` | Node tests for interface translation behavior and coverage |

`main.js` imports ES modules directly. TensorFlow.js is loaded as the global `tf` before `model.js` is dynamically imported. Keep that ordering.

Dependency versions currently used:

- TensorFlow.js: `4.22.0`.
- MediaPipe Tasks Vision: `0.10.14`.
- Hand Landmarker and Pose Landmarker Lite task assets.

If changing versions, update both runtime URLs and `scripts/vendor.sh`, then test CDN fallback and local loading.

## Data contracts: preserve compatibility

### Samples and features

- `T = 30` frames and `D = 134` features per frame.
- A sample's `data` is a `Float32Array` of length `4020` at runtime.
- Sample fields are `{ id, sign, signer, data, at }`; `at` is an ISO timestamp.
- The first two frame features encode nose position relative to the shoulder midpoint.
- Two 66-feature hand slots follow: right, then left. Each contains presence, relative wrist position, and 21 wrist-relative 3D landmarks.
- Mirroring swaps hand slots and negates horizontal coordinates. Display mirroring alone is not equivalent to feature mirroring.
- Augmentation belongs to training data only. Never augment validation data or leak validation samples into training before evaluation.

Changing dimensions, feature order, normalization, or hand-slot semantics can invalidate saved samples and models. Design an explicit compatibility strategy before doing so.

### Persistence and interchange

| Location/key | Content |
| --- | --- |
| IndexedDB database `dilmanc`, store `samples` | Landmark samples keyed by `id` |
| TensorFlow.js `indexeddb://dilmanc-model` | Trained model |
| localStorage `dilmanc.model.v1` | Model metadata |
| localStorage `dilmanc.vocab.v1` | Editable signs and composition rules |
| localStorage `dilmanc.language` | Interface locale, `az` or `en` |
| localStorage `dilmanc.voice` | Selected browser voice name |
| localStorage `dilmanc.threshold` | Confidence threshold as a percentage |

Storage is origin-specific. Changing host or port can make existing browser data appear missing; that does not prove deletion.

Dataset exports use `format: "dilmanc-dataset"` and `version: 1`, with `exportedAt`, `vocab`, and `samples`. Typed arrays become numeric arrays in JSON and are restored on import.

Import uses ID-based replacement, not append-only insertion. An existing sample ID must update the stored sample so corrected signer labels do not create duplicates. Keep unknown sample identities distinct.

The reserved background class ID is `_fon`. Do not rename it or translate it in persisted data. Vocabulary sign IDs also act as foreign keys in samples, model classes, and phrase-rule sequences.

## Localization

The interface supports Azerbaijani and English. The selected interface language does not change the sign vocabulary, spoken phrases, or `az-AZ` speech recognition language.

- Azerbaijani source strings are dictionary keys in `js/i18n.js`.
- Use `data-i18n` on static leaf text nodes in HTML.
- Use `t(key, params)` for generated labels and formatted messages.
- Use `ui(element, key, params)` for active logs, errors, and messages that must update when the locale changes.
- Do not put translation bindings on containers with nested controls: translation sets `textContent` and would remove children.
- Keep user-entered vocabulary, signer names, and speech transcripts out of translation bindings.
- Use the current `locale()` for number, percentage, and time formatting.
- Switching language must not reset the camera, erase samples, replace vocabulary, or discard the trained model.
- Azerbaijani voices are preferred, with Turkish voices available as fallback. Do not promise a particular installed voice.

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
- Browser speech recognition and some synthesis voices may use remote services.

Keep these distinctions in documentation, not as persistent reassuring UI slogans. Do not add network transmission of participant data without explicit authorization.

## Verification

From the repository root:

```sh
node --test tests/i18n.test.mjs
for file in js/*.js; do node --check "$file" || exit 1; done
```

Node.js is for these checks, not an application runtime requirement. There is no `npm test` or production build command currently configured.

For UI changes, serve the app and check all four views at 390, 768, and 1440 px. Verify:

- AZ/EN switches static labels, dynamic controls, messages, errors, and chart legends.
- The selected locale survives reload.
- Sample counts, vocabulary, phrases, and stored model survive language switching.
- Tables scroll within their containers; the whole page does not overflow horizontally.
- The mobile menu opens, closes, and navigates correctly.
- Projector mode and keyboard shortcuts still work.
- Permission/loading/error overlays remain readable; removed readiness indicators stay absent.
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
