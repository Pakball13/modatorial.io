# Training folder

This folder holds the neural network weights and config for the
"Bots Are Getting Smarter" mod.

## Files

- `config.json` — network shape + hyperparameters (shipped with mod)
- `policy.json` — trained weights (starts as a placeholder; overwritten
  when you click "Export policy" in the mod menu)

## How training works

The mod captures bot decisions while you play, then runs mini-batch
gradient descent entirely in the browser. No Python needed.

The network has 4 weight layers:
    input(48) → 128 → 128 → 64 → output(2)

- Output 0: should-attack probability (0..1)
- Output 1: fraction of strength to commit (0..1)

Training runs in the background every ~400ms, one mini-batch per tick.

## Workflow

1. Play the game normally. The mod captures bot decisions.
2. Watch the HUD: step count + loss should go down over time.
3. When loss < 0.20, click **📥 Export policy** in the mod menu.
4. Drop the downloaded file in this folder, rename to `policy.json`.
5. Reload the game — bots now use your trained network.

## Tuning

Edit `config.json` to change:

- `learningRate` — higher = faster but less stable
- `layers` — network shape (must end with 2)
- `batchSize` — gradient samples per step
- `minBufferBeforeTrain` — samples needed before training begins