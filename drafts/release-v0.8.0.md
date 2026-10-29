<!--
Tag: v0.8.0   Target: master   Title: AI Task Export v0.8.0
Asset: SnAITasks/build/outputs/SnAITasks-v0.8.0.snplg
Mark as pre-release (Supernote plugins are still in beta firmware).
-->

# AI Task Export v0.8.0

Turn handwritten to-dos on your Supernote into tasks in **Amazing Marvin** or **Todoist**, using **Claude** or **OpenAI** with your own API key.

## What's new
- **Works on smaller screens.** The layout now scales to the device: Manta stays as it was; Nomad, A5X and A6X (1404×1872 px) get every font, margin and padding scaled down (about 0.73×) so the menu, results and Settings fit. Follows rotation. Button rows wrap instead of clipping if space is still tight.
- **Show details** now logs the screen size and scale factor, so a photo of that screen is enough to report a layout problem.
- README: data-flow section now lists all four services (it only listed Anthropic and Marvin before).

## Features
- **NOTE sidebar → AI Task Export:** This page / Whole note / Choose pages (`1-3, 5`) / Marked headings (diagonal-line heading style only).
- **Lasso → Export Tasks:** everything selected becomes a task, and nothing else is sent. Use it to add one more item without duplicates.
- **DOC text selection → Export Tasks.**
- Handwriting is recognized on the device and sent as text. A page goes as an image only if recognition fails.
- More than 10 pages asks first, with a time and cost estimate. Tasks found so far are kept if a later batch fails.

## Install
1. Download `SnAITasks-v0.8.0.snplg` below and copy it to `MyStyle/` (USB, Supernote Partner, or Cloud).
2. On the device: **Settings → Apps → Plugins → Add Plugin**, then pick the file.
3. Enter your keys in the plugin's ⚙ (or via a key file in `MyStyle`; see README). Allow the file and network prompts.

Upgrading: install over the old version with **Add Plugin**. Saved keys carry over.

## Privacy
- Permissions: `INTERNET`, `FILE:READ`, `FILE:WRITE` (no delete).
- Note text/images go only to the AI you pick (`api.anthropic.com` or `api.openai.com`). Task titles and notes go only to your task app (`serv.amazingmarvin.com` or `api.todoist.com`). No analytics, no other servers.
- Keys are stored on-device in `MyStyle/SnMarvin/settings.note`, base64-obfuscated, **not encrypted**.

## Compatibility
- Built against `sn-plugin-lib` 0.2.3, React Native 0.79.2. Needs plugin-capable firmware.
- Tested on Manta. Nomad/A5X/A6X layout is new in this release. Reports with a **Show details** photo are welcome.

**Checksum (SHA-256):** `b226bd2357cedbb0b2d8380ec04db86b96654ff3bc6643152c5cd51e63f956db`
