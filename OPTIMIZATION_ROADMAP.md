# HUFF Classic Roadmap — After Infrastructure Freeze

## Completed

Passes 1–29 complete the planned Classic optimization and infrastructure sequence.

## Pass 30 — Constrained Pipeline Switching Foundation

Add a small validated recipe selector around the existing stage-contract registry.

Requirements:

- current Pass 22 order remains the default `CLASSIC` recipe;
- no unrestricted node graph;
- no hidden full-resolution buffer allocation;
- no undeclared feedback cycles;
- each recipe validates before rendering;
- each recipe declares stage order, buffer ownership, scratch use, and legal Global Mix points;
- switching must be atomic and recover to `CLASSIC` on validation failure;
- Flow remains unchanged.

Initial work should focus on infrastructure and one or two carefully audited alternate serial recipes, not a large route catalogue.

## Pass 31+ — Paired-down effect augmentation

After recipe switching is stable:

- augment only a curated set of effects;
- preserve old behavior behind neutral/default settings;
- test each augmentation across every supported Classic recipe;
- avoid effects that require broad parallel GPU routing or high-resolution temporal stores;
- keep the free edition coherent, predictable, and supportable.

## HUFF HD / wgpu

HUFF Classic proves interaction models and useful route relationships. HUFF HD can then expand accepted ideas into:

```text
typed video/mask/key ports
parallel branches
explicit field/trail/feedback stores
program and preview buses
auxiliary sends
legal temporal cycles
GPU resource budgets
high-resolution output
full modular routing
```
