# Competitive Ranking — MTG

## Submodules

| Path      | Upstream                                    |
| --------- | ------------------------------------------- |
| `MTG-API` | <https://github.com/Vince-maple-byte/MTG-API> |

## Cloning

`--recursive` pulls submodule contents. Without it, `MTG-API/` is empty.

```bash
git clone --recursive <repo-url>
```

Already cloned without it:

```bash
git submodule update --init --recursive
```

## Daily Work

Update the submodule to upstream's latest commit:

```bash
git submodule update --remote MTG-API
```

The parent repo pins a commit, not a branch. `--remote` moves that pin; it still needs a commit here to persist.

Pull the pin recorded in the parent repo:

```bash
git submodule update --init --recursive
```

## Adding a Submodule

```bash
git submodule add <url> [path]
```

This writes `.gitmodules` and stages the entry. Commit both.
