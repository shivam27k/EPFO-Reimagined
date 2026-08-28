### EPF Sahayak — Your AI Guide to Provident Fund Services

EPF Sahayak reimagines the provident fund portal around an AI assistant that guides members from “What should I do?” to “Here’s your next step.”

Instead of expecting users to understand complex terminology or search through multiple menus, the assistant lets them explain their needs naturally through text or voice. Hinglish-first voice conversations make the experience more approachable for people who prefer speaking over navigating forms.

The AI understands the current page, available services, and relevant member information to provide contextual guidance. It explains requirements, identifies missing information, and guides users through supported workflows.

It also helps users operate the portal directly. Simply asking “Open my claims,” “Show my passbook,” or “Scroll to the contribution details” lets the assistant navigate pages, open relevant sections, and scroll to the information they need. Users can move through the portal conversationally instead of searching for every button themselves.

For example, a member asking “Mujhe PF nikalna hai—kya karna padega?” can receive guidance on the relevant options and be taken to the appropriate claim journey. Actions requiring approval remain subject to explicit user confirmation.

Compared with a conventional menu-driven experience, EPF Sahayak reduces the effort of finding services, understanding requirements, and deciding what comes next. Unlike a standalone chatbot, its guidance is connected to the interface and available actions.

The result is an AI companion that does more than answer questions—it helps members understand, navigate, and progress with confidence and control.

## Start locally

From this `web` directory in PowerShell:

```powershell
bun install
Copy-Item .env.example .env.local
New-Item -ItemType Directory -Force .data | Out-Null
bun run db:migrate
bun run db:seed
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

`OPENAI_API_KEY` is optional. When it is blank, the text assistant offers limited offline guidance and explicit navigation; it does not simulate a model-backed answer. Existing model overrides are preserved.

## Assistant voice

Live voice defaults to `cedar`, with semantic turn detection and microphone echo/noise processing. Set `OPENAI_REALTIME_VOICE` to change the preset or `OPENAI_REALTIME_VAD=server_vad` to use timing-based turn detection. Restart the voice session after changing settings.

Leave `OPENAI_TTS_VOICE` blank to use the recorded-speech model's compatible default: Cedar for `gpt-4o-mini-tts`, Onyx for explicit legacy `tts-1`/`tts-1-hd`. Voice character and Hindi pronunciation still need a listening check.

Assistant actions remain limited to synthetic demo records. They cannot submit a final claim or contact live EPFO, bank, employer, or payment systems. Keep API keys server-side.

Further integration checks were paused at the user's request. Later assistant changes are untested; no live task-completion percentage is claimed.

See [DEMO.md](./DEMO.md) for both credentials, the two judge journeys, simulation controls, replay behavior, and prototype limitations.
