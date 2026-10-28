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
2. **Config file.** Copy `config.example.json` to the device as `MyStyle/SnMarvin/config.json` and fill in both keys.
   `model` and `titleSuffix` are optional.
3. **Install.** Copy `SnMarvin.snplg` into `MyStyle/` and install it from **Settings → Apps → Plugins → Add Plugin**.
4. **First use.** Allow the *file access* and *network* permission prompts ("Always allow" avoids being asked again).

The keys stay in plain text on the device, so don't share that config file or a device backup of it.

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

```bash
adb push build/outputs/SnMarvin.snplg /storage/emulated/0/MyStyle/
adb logcat -c && adb logcat -s ReactNativeJS:V PluginHost:V   # plugin logs are tagged [SnMarvin]
```

When reinstalling over an existing build, use **Add Plugin** and pick the new file (or overwrite
`MyStyle/Plugins/SnMarvin.snplg`). Reinstalling the existing entry reuses the old copy.

| Message | Fix |
|---|---|
| `Missing …/config.json` / `needs anthropicApiKey…` | Check the file path and both keys. |
| `File access was denied` / `Network access was denied` | Settings → Apps → Plugins → Send to Marvin → permissions. |
| `Claude rejected the API key (401)` | Check `anthropicApiKey` and the Console billing status. |
| `Marvin rejected the API token` | Use the API token from Marvin's API settings. |
| `… failed: generateLassoPreview` / `generateNotePng` | Capture failed. Grab `adb logcat` output and check for `PluginSec: DENY`. |

## Data sent off-device

The page or selection image (or the selected DOC text) goes to `api.anthropic.com`, and the extracted task
titles and notes go to `serv.amazingmarvin.com`. Nothing else leaves the device.
