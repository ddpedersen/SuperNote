# Send to Marvin (Supernote plugin)

Send handwritten to-dos from a Supernote Manta to Claude, which extracts tasks and adds them to your
[Amazing Marvin](https://amazingmarvin.com) inbox, scheduled for today.

| Where | Button | What it does |
|---|---|---|
| NOTE sidebar | **Page → Marvin** | Renders the current page and adds every to-do Claude finds. |
| NOTE lasso toolbar | **To Marvin** | Captures the selection, then asks **Tasks** or **Research**. |
| DOC text-selection toolbar | **To Marvin** | Sends the selected text, same two choices. |

**Tasks** extracts the actionable items (checked-off/crossed-out ones are skipped).
**Research** creates `Research: <topic>` with Claude's questions and search terms in the note.
When it finishes, the plugin shows how many tasks were added, with their titles.

Flow: capture (PNG or text) → Claude Messages API (structured JSON output) → Marvin `addTask`, one call per task,
no `parentId` (Inbox), title suffixed with `+today`. A due date written on the page is passed as `dueDate`.

## Setup

1. **Keys**
   - Anthropic API key: <https://console.anthropic.com/settings/keys> (pay-per-use API billing, separate from a Claude.ai subscription).
   - Marvin API token: Marvin → Settings → API (use the regular *API Token*, not the full-access token).
2. **Install.** Copy `SnMarvin.snplg` into `MyStyle/` and install it from **Settings → Apps → Plugins → Add Plugin**.
3. **First use.** Open a note and tap any plugin button. With no keys saved, the **Settings** screen opens:
   enter both keys, tap **Test**, then **Save & send** (the page or selection you started with is sent right after).
   Allow the *file* and *network* permission prompts ("Always allow" avoids being asked again).
   Settings can be reopened from the **Settings** button on the plugin's result screen.

To skip typing keys on the device, copy `config.example.json` to `MyStyle/SnMarvin/config.json` with your keys
filled in, then use **Import from config.json** on the Settings screen and **Save**. Delete the file afterwards.

Settings are saved in `MyStyle/SnMarvin/settings.note` (a small note used as storage, since the plugin SDK has no
file-write API) and survive plugin updates. Keys are base64-obfuscated there, not encrypted, so treat device
backups accordingly. Saving needs a note to be open; it doesn't work from a PDF.

## Build

Requires Node 18+. JS-only, so no Android SDK/Gradle is needed:

```bash
npm install
./buildPlugin.sh          # → build/outputs/SnMarvin.snplg   (Windows: .\buildPlugin.ps1)
npm test                  # unit tests for the Claude/Marvin request code
```

Keep `react-native` at **0.79.2** and `react` at **19.0.0** (fixed by the device's plugin host). Never change
`pluginID` in `PluginConfig.json`, or the device treats the plugin as a different one.

## Debugging

**No computer needed:** tap **Show details** on the plugin screen. It lists every step of the last send:
button, permissions, config (keys masked), capture results, the Claude and Marvin HTTP status codes, and any error.
A photo of that screen is usually enough to diagnose a problem. Keys are never shown in full.

With ADB (optional; Supernote may block `adb shell`/`logcat` on some firmware):

```bash
adb push build/outputs/SnMarvin.snplg /storage/emulated/0/MyStyle/
adb logcat -c && adb logcat -s ReactNativeJS:V PluginHost:V   # plugin logs are tagged [SnMarvin]
```

When reinstalling over an existing build, use **Add Plugin** and pick the new file (or overwrite
`MyStyle/Plugins/SnMarvin.snplg`). Reinstalling the existing entry reuses the old copy.

| Message | Fix |
|---|---|
| `Settings can only be saved with a note open` | Open a note (not a PDF), then open the plugin. |
| `File access was denied` / `Network access was denied` | Settings → Apps → Plugins → Send to Marvin → permissions. |
| `Claude rejected the API key (401)` | Check `anthropicApiKey` and the Console billing status. |
| `Marvin rejected the API token` | Use the API token from Marvin's API settings. |
| `… failed: generateLassoPreview` / `generateNotePng` | Capture failed. Grab `adb logcat` output and check for `PluginSec: DENY`. |

## Data sent off-device

The page or selection image (or the selected DOC text) goes to `api.anthropic.com`, and the extracted task
titles and notes go to `serv.amazingmarvin.com`. Nothing else leaves the device.
