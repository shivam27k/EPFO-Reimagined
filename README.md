# EPF Sahayak

EPF Sahayak is an independent, member-facing EPFO experience redesign built for the Build What Moves India hackathon. It uses fictional member records and disclosed mock employer, EPFO, Aadhaar, bank, ECR, and payment events. It has no connection to live government systems.

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
