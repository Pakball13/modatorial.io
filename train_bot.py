import json, glob, torch, torch.nn as nn, numpy as np
from torch.utils.data import DataLoader, TensorDataset

# Auto-find the newest training data file in this folder
files = sorted(glob.glob("bot-training-data-*.json"))
if not files:
    raise SystemExit("No bot-training-data-*.json found in this folder. Did you run BotTrainer.export() in the game?")

data_file = files[-1]
print(f"Loading {data_file}...")

with open(data_file, "r", encoding="utf-8") as f:
    data = json.load(f)

samples = data["samples"]
print(f"Loaded {len(samples)} samples.")
print(f"Features per sample: {len(data['featureNames'])}")

X = np.array([s["features"] for s in samples], dtype=np.float32)
y_reg = np.array([[s["action"]["committedFrac"]] for s in samples], dtype=np.float32)
y_cls = (y_reg > 0.05).astype(np.float32)

print(f"X shape: {X.shape}")
print(f"Attack decisions: {int(y_cls.sum())} / {len(y_cls)} ({100*y_cls.mean():.1f}%)")

class BotPolicy(nn.Module):
    def __init__(self, n_in):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_in, 64), nn.ReLU(),
            nn.Linear(64, 64),   nn.ReLU(),
            nn.Linear(64, 32),   nn.ReLU()
        )
        self.attack_head = nn.Linear(32, 1)
        self.amount_head = nn.Linear(32, 1)

    def forward(self, x):
        h = self.net(x)
        return torch.sigmoid(self.attack_head(h)), torch.sigmoid(self.amount_head(h))

model = BotPolicy(X.shape[1])
opt = torch.optim.Adam(model.parameters(), lr=1e-3)
loss_fn = nn.BCELoss()

ds = TensorDataset(torch.from_numpy(X), torch.from_numpy(y_cls), torch.from_numpy(y_reg))
dl = DataLoader(ds, batch_size=128, shuffle=True)

EPOCHS = 30
for epoch in range(EPOCHS):
    total = 0
    for xb, yb_cls, yb_reg in dl:
        opt.zero_grad()
        p_attack, p_amount = model(xb)
        loss = loss_fn(p_attack, yb_cls) + loss_fn(p_amount, yb_reg)
        loss.backward()
        opt.step()
        total += loss.item()
    print(f"epoch {epoch+1:2d}/{EPOCHS}  loss {total/len(dl):.4f}")

weights = {}
for name, param in model.named_parameters():
    weights[name] = param.detach().numpy().tolist()

with open("policy.json", "w", encoding="utf-8") as f:
    json.dump({"version": 1, "features": data["featureNames"], "weights": weights}, f)

print("\nSaved policy.json")