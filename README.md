<p><img src="assets/elvo-logo.svg" alt="Elvo" width="220"></p>

# Elvo

**A voice for signing hands.** A browser-based sign recognition prototype for a clinic reception scenario in Azerbaijan.

Elvo learns a small, user-recorded vocabulary, recognizes signs through a webcam, composes predefined Azerbaijani phrases, and reads them aloud. A speech-to-text panel lets a hearing person reply on screen.

This is a limited-vocabulary prototype, not a general sign language translator or a medical device. Validate every sign with fluent local signers before collecting training data.

## Quick start

```sh
git clone https://github.com/reav4nn/elvo.git
cd elvo
sh scripts/vendor.sh
python3 server.py --configure
```

Python 3.10+ is required; the server uses the standard library only. Enter your Azure Speech region and key at the terminal prompt; the key is hidden and saved in a local ignored `.env` file. Open `http://localhost:8000` and allow camera access. On subsequent starts, run `python3 server.py`. Static servers such as `npx serve` do not provide the Azure speech endpoints. Camera access requires HTTPS or localhost; opening `index.html` directly will not work.

Use a current version of Chrome or Edge. Speech output uses Azure Azerbaijani Neural TTS with Banu or Babek, independently of installed browser voices, at a 10% faster rate with short pauses between sentences. Select a voice and use **Test** to verify it. **Prepare demo voices** caches vocabulary and demo phrases for that voice; new text requires internet. See [Azure speech setup](#azure-speech-setup).

## Features

- Azerbaijani and English interface languages, with a saved AZ / EN selection. Vocabulary, spoken phrases, and speech recognition remain Azerbaijani.
- Live webcam sign recognition with hand landmark overlays and confidence scores.
- Recording with a countdown, signer labels, and automatic rejection of sign samples with insufficient hand visibility.
- In-browser TensorFlow.js training and per-class evaluation.
- Random stratified validation or a held-out signer evaluation, followed by training a final model on all samples.
- Editable vocabulary and phrase composition rules.
- Azure Azerbaijani speech synthesis with local audio caching; browser-dependent Azerbaijani speech recognition, typed replies, and quick replies.
- Dataset validation and export/import across team members' computers.
- Portable model bundles containing weights, class order, vocabulary, and evaluation metadata.
- Confusion matrices and balanced recall for evaluation.
- Projector mode and local dependency downloads.

## Workflow

1. Validate the vocabulary with fluent signers.
2. In **Nümunə yazma**, select a sign, enter the actual signer's name, and record examples.
3. Record **Fon** examples as well: hands out of view, resting hands, ordinary gestures, touching the face, and handling objects without signing.
4. Collect each sign from multiple people, with varied clothing, lighting, and camera distances.
5. In **Model**, select a validation method and train.
6. In **Canlı tərcümə**, test recognition, phrase composition, and speech output.

Keep signer labels accurate. Incorrect labels invalidate held-out signer evaluation, even if recognition appears to work.

### Dataset guidance

Aim for at least 20 samples per class from at least three signers as an initial collection target, not a guarantee of accuracy. Background examples should cover realistic non-signing movements.

To combine recordings, export each dataset and import them on one computer. Imported samples with an existing ID replace the stored version, allowing corrected signer labels to be applied without duplication.

For an honest demo result, report the number of test samples, class coverage, and evaluation method. Random sample splits can be optimistic when the same people and recording conditions appear in both sets. A held-out signer result is only meaningful when labels are correct and the test signer covers the intended vocabulary.

## How it works

1. MediaPipe detects up to two hands and periodically estimates body landmarks.
2. Each frame becomes 134 features describing hand presence, wrist position relative to the shoulders, and hand shape relative to the wrist.
3. A one-second window is resampled to 30 frames and feeds a small temporal Conv1D classifier trained with TensorFlow.js; long tracking stalls are rejected.
4. Training augmentation adds temporal crops, position and scale variation, shape jitter, and random mirroring. Mirroring swaps hand slots and flips horizontal coordinates; it is a robustness technique, not proof of left-handed signer accuracy.
5. Predictions require a stable winner, confidence threshold, and margin over the runner-up. Repeating the same sign requires a neutral interval. Evaluation continues for 600 ms after the hands leave, so a final sign that ends as the hands drop is still recognized.
6. Predefined rules compose recognized tokens, for example `baş + ağrı` becomes `Başım ağrıyır.`
7. Each new phrase is synthesized during the pause, so it is ready when it is spoken after the pause or when the user presses Enter.

Capture spans one second across supported camera frame rates. Training time depends on the device and dataset. Held-out signer evaluation requires every class in both partitions; the final live model is then trained on all samples.

## Local dependencies and connectivity

```sh
sh scripts/vendor.sh
```

This downloads TensorFlow.js, MediaPipe, and landmark models into `vendor/`. These files are excluded from Git. With the downloads complete, local sign recording, training, and recognition can run without fetching these dependencies from a CDN.

Google Fonts still requires a network connection; system fonts are used as a fallback. Speech recognition may use the browser provider's services and require internet. Azure speech requires internet for uncached text; the same text and voice can be replayed from `.dilmanc-cache/tts/` offline while the local server is running. Test the exact presentation setup before relying on offline operation.

## Azure speech setup

1. In the Azure portal, open or create a Speech resource. Copy `KEY 1` and the short region code, such as `westeurope`, from **Keys and Endpoint**. Do not use the endpoint URL as the region.
2. Run `python3 server.py --configure` (`py server.py --configure` on Windows). Enter the region and key in the terminal; the key is hidden and saved only to the ignored `.env` file.
3. Open `http://localhost:8000`. Later, start the app with `python3 server.py`.
4. In **Vocabulary & settings**, choose Banu (`az-AZ-BanuNeural`) or Babek (`az-AZ-BabekNeural`) and press **Test**. Only Test confirms that the key works.
5. Before a demo, press **Prepare demo voices** while online. Vocabulary phrases, composition rules, and the standard demo phrases are cached for the selected voice. Azure usage may be billed according to your subscription.

When Azure is configured, vocabulary and combination phrases for the selected voice are cached in the background after startup. Cached audio is stored in `.dilmanc-cache/tts/` and is reused only for the same text and voice. Dataset and model exports do not include audio; copy `.dilmanc-cache/` separately to a backup computer. Changing the port changes browser storage, so export the dataset before switching servers. If port 8000 is already in use, stop the old server first.

| Message | Action |
| --- | --- |
| Speech server unavailable | Stop the static server and run `python3 server.py` |
| Azure not configured | Run `python3 server.py --configure` |
| Check the Azure key, region, and access | Confirm both values come from the same Speech resource, then reconfigure |
| Request limit reached | Check the Azure quota and try again later |
| Could not connect to Azure | Check the internet connection; only previously cached text can play |
| Browser blocked audio | Press **Speak** or **Test**, then check the site's audio permission |

The server is intended for `127.0.0.1` only. Public hosting is outside the scope of this setup.

## Privacy and storage

The application's sign processing runs locally. It stores landmark feature samples and the trained model in browser storage, not recorded video on an application server.

New speech text is sent by the local Python server to Azure; the API key stays on the server. Cached audio is stored locally. The server only listens on `127.0.0.1` and does not serve `.env`, `.git`, or the audio cache as static files. Browser speech recognition may process microphone audio remotely. Do not describe the complete application as offline or entirely local when those services are enabled. Obtain participants' consent before collecting or sharing datasets. Export backups before clearing browser storage.

Elvo was previously called Dilmanc. Browser storage keys, the IndexedDB database, the audio cache folder, and the dataset and model file format IDs keep the `dilmanc` prefix, so data recorded before the rename still loads and exports remain compatible with older copies.

## Three-minute demo

1. **Problem, 30 seconds:** explain the communication barrier at a clinic reception.
2. **Live interaction, 90 seconds:** demonstrate `salam`, `baş`, `ağrı`, and `dərman`, followed by a spoken reply displayed as text.
3. **Evidence, 30 seconds:** show the actual evaluation method, sample counts, and per-class results.
4. **Adaptability, 30 seconds:** explain custom vocabulary and demonstrate recording or retraining only if it reliably fits the time available.

Prepare a backup recording. Avoid promising a fixed training time or perfect accuracy.

## Keyboard shortcuts

- **Space:** start or stop recording in the recording view.
- **Enter:** speak the pending phrase in the live view.
- **Backspace:** remove the last pending sign in the live view.
- **Escape:** leave projector mode.

For camera-free interface testing, open `http://localhost:8000/?nocam`.

Run the JavaScript tests (Node.js 20+, with downloaded vendor assets) and Python server tests:

```sh
npm test
npm run test:server
```

For the simulated UI workflow, run `npm install` and `npm run test:ui`. Tests use synthetic sign features and mocked Azure audio, not live speech credentials or a real camera. Export the dataset before migration and keep the same browser profile and origin to retain browser storage. Portable model bundles can be imported on another computer without retraining; audio caches must be copied separately.

Runtime assets under `vendor/` remain excluded from Git and must be downloaded after cloning.

## Project structure

```text
index.html         Application views
assets/            Elvo logo and mark (SVG)
css/app.css        Visual styles
js/main.js         UI, recording, and live recognition flow
js/i18n.js         Azerbaijani and English interface strings
js/vision.js       Camera and MediaPipe integration
js/features.js     Feature extraction and augmentation
js/model.js        Training, evaluation, inference, and persistence
js/vocab.js        Vocabulary and phrase composition
js/speech.js       Azure audio client and browser speech recognition
js/temporal.js     Fixed-duration resampling and recognition gating
server.py          Local Azure speech server and disk audio cache
js/store.js        IndexedDB storage and dataset import/export
js/charts.js       Evaluation charts
scripts/vendor.sh  Local dependency downloader
```

## Commit convention

Write commit messages and repository documentation in English. Use Conventional Commits:

```text
feat(scope): add a new capability
fix(scope): correct existing behavior
docs(scope): update documentation
chore(scope): maintain tooling or configuration
```

Keep Azerbaijani interface labels and spoken phrases in Azerbaijani.

## Limitations

- Recognition is restricted to the recorded vocabulary and training conditions.
- Facial grammar, unrestricted continuous signing, and fingerspelling are not implemented.
- Rule-based phrases are not a general sign language grammar model.
- Mirroring augmentation and high confidence scores do not establish real-world accuracy.
- Validate signing conventions with the intended Azerbaijani users rather than assuming one universal vocabulary.
- Do not use this prototype for clinical decisions or as a replacement for a qualified interpreter.
