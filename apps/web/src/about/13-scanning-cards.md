# Scanning cards

The scanner reads a card's name from the camera or a photo and searches for it. It never adds a card by itself.

## Scanning a card

1. Choose **Scan card...** (Home ribbon tab, Cards menu, or **Scan** on the phone).
2. Allow camera access when the browser asks.
3. Hold the card inside the white frame with the name clearly visible.
4. Choose **Capture live view**, or **Take or choose photo** to use a picture instead.
5. Mana Vault reads the text on the device, picks the most likely card name and searches for it. The window closes and a message names the card it searched for.
6. Check the results and add the right printing yourself.

**Switch camera** swaps between the back and front cameras. **Close** (or Esc, or clicking outside the window) stops the camera.

## Requirements and limits

- The live camera needs a secure connection (HTTPS) or a local address. Photos work everywhere.
- The first scan downloads the English text recognition model, which can take a moment; later scans reuse it.
- Text recognition runs in the browser. Images are not sent to the Mana Vault server.
- Recognition works best with good light, a flat card and the name in focus. Foil glare and unusual frames can prevent a match.

## Messages

| Message | Meaning and what to do |
|---|---|
| Starting camera | The browser is opening the camera |
| Camera access is unavailable. Use HTTPS or localhost, or choose a photo instead. | The page is not on a secure connection or the browser has no camera support |
| Camera permission was denied. Allow camera access in your browser settings, or choose a photo instead. | Camera access was refused |
| No camera was found. Choose a photo instead. | The device has no camera |
| Could not start camera: reason | The camera failed to open |
| Camera is not ready yet. | Capture was chosen before the camera started; wait a moment |
| Reading card text, N% | Recognition is running |
| No card name was recognized. Try better lighting and hold the card steady. | No text that looks like a card name was found |
| Card text recognition failed: reason | The recognition model could not run or download |
| Choose an image file to scan. | The chosen file is not an image |
| Photo must be 20 MB or smaller. | The photo is too large |
| Could not read photo: reason | The photo could not be opened |
