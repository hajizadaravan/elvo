# Dilmanc

**A voice for signing hands.** A browser-based sign recognition prototype for a clinic reception scenario in Azerbaijan.

Dilmanc learns a small, user-recorded vocabulary, recognizes signs through a webcam, composes predefined Azerbaijani phrases, and reads them aloud. A speech-to-text panel lets a hearing person reply on screen.

This is a limited-vocabulary prototype, not a general sign language translator or a medical device. Validate every sign with fluent local signers before collecting training data.

## Quick start

```sh
git clone https://github.com/reav4nn/dilmanc.git
cd dilmanc
python3 -m http.server 8000
```

Open `http://localhost:8000` and allow camera access. Alternatively, run `npx serve .` and open the URL it prints. Camera access requires HTTPS or localhost; opening `index.html` directly will not work.

Use a current version of Chrome or Edge. Available Azerbaijani and Turkish speech voices depend on the browser, operating system, and installed voices. Check the voice selector before presenting; do not assume a specific voice is available.

## Features

- Live webcam sign recognition with hand landmark overlays and confidence scores.
- Recording with a countdown, signer labels, and automatic rejection of sign samples with insufficient hand visibility.
- In-browser TensorFlow.js training and per-class evaluation.
- Random stratified validation or a held-out signer evaluation, followed by training a final model on all samples.
- Editable vocabulary and phrase composition rules.
- Speech synthesis and browser-dependent Azerbaijani speech recognition.
- Dataset export and import across team members' computers.
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
3. A 30-frame window feeds a small temporal Conv1D classifier trained with TensorFlow.js.
4. Training augmentation adds temporal crops, position and scale variation, shape jitter, and random mirroring. Mirroring swaps hand slots and flips horizontal coordinates; it is a robustness technique, not proof of left-handed signer accuracy.
5. Predictions are smoothed and filtered by a confidence threshold.
6. Predefined rules compose recognized tokens, for example `baş + ağrı` becomes `Başım ağrıyır.`
7. The phrase is spoken after a pause or when the user presses Enter.

Thirty frames are approximately one second at 30 FPS. Actual capture duration and training time depend on the device.

## Local dependencies and connectivity

```sh
sh scripts/vendor.sh
```

This downloads TensorFlow.js, MediaPipe, and landmark models into `vendor/`. These files are excluded from Git. With the downloads complete, local sign recording, training, and recognition can run without fetching these dependencies from a CDN.

Google Fonts still requires a network connection; system fonts are used as a fallback. Speech recognition and some speech synthesis voices may use browser or provider services and may require internet access. Test the exact presentation setup before relying on offline operation.

## Privacy and storage

The application's sign processing runs locally. It stores landmark feature samples and the trained model in browser storage, not recorded video on an application server.

Browser speech services may process audio or text remotely. Do not describe the complete application as offline or entirely local when those services are enabled. Obtain participants' consent before collecting or sharing datasets. Export backups before clearing browser storage.

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

## Project structure

```text
index.html         Application views
css/app.css        Visual styles
js/main.js         UI, recording, and live recognition flow
js/vision.js       Camera and MediaPipe integration
js/features.js     Feature extraction and augmentation
js/model.js        Training, evaluation, inference, and persistence
js/vocab.js        Vocabulary and phrase composition
js/speech.js       Browser speech synthesis and recognition
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
