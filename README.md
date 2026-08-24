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

`OPENAI_API_KEY` is optional. When it is blank, the text assistant uses the built-in grounded fallback. Set `OPENAI_MODEL` to an available Responses API model if you want to override the documented default.

See [DEMO.md](./DEMO.md) for both credentials, the two judge journeys, simulation controls, replay behavior, and prototype limitations.
