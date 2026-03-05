# Pass Review Tool

Local approval UI for iterative visual passes.

## Start the tool

```bash
npm run review:serve
```

Open:

`http://127.0.0.1:4317`

## Publish a pass

1. Create a JSON file with this shape:

```json
{
  "passId": "helix-pass-001",
  "title": "Helix Comparison Pass",
  "summary": "Wide-angle comparison against toy reference",
  "screenshots": [
    { "label": "Overview", "path": "screenshots/agent-debug-overview.png" },
    { "label": "Side", "path": "screenshots/agent-debug-side.png" },
    { "label": "Top", "path": "screenshots/agent-debug-top.png" }
  ],
  "reasoning": "What changed and why",
  "nextSteps": ["Step 1", "Step 2"]
}
```

2. Publish it:

```bash
npm run review:publish -- tools/pass-review/examples/pass-example.json
```

The tool resets decision status to `pending` for each new pass.

## Review flow

- Use thumbnail buttons or previous/next controls to switch screenshots.
- Read reasoning and next steps under the viewer.
- Click `Approve` to continue.
- Click `Decline` only after entering a reason (required).

Decision state is stored in:

- `tools/pass-review/state/current-pass.json`
- `tools/pass-review/state/decision.json`
