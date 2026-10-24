---
name: ai-slay-the-spire-2
description: Strategy workflow for piloting Slay the Spire 2 runs with an AI agent. Use when deciding combat plays, card rewards, route choices, shops, rest sites, relics, potions, or post-run tuning for Slay the Spire 2, especially Ironclad-style warrior runs.
---

# AI Slay the Spire 2

Use this skill as a compact decision layer. Load detailed references only when the current game state needs them.

## Core Loop

1. Read the current game state: act, floor, HP, deck, relics, potions, map, enemies, rewards, and known boss.
2. Evaluate deck readiness with `references/deck_strength_evaluation.md`.
3. Identify `weakness_tags`: `damage`, `block`, `scaling`, `draw`, `aoe`, `control`, `elite_survival`, `boss_solution`.
4. Evaluate the next 3-5 floors as a run segment: route risk, rest/shop access, boss needs, and expected HP loss.
5. Choose the action that solves the nearest real threat without damaging long-term consistency.
6. Record short reasoning when a decision is non-obvious so later runs can tune parameters.

## Reference Loading

- For route, shop, rest-site, potion, boss, and high-level strategy, read `references/broken_star_sts_strategy.md`.
- For card rewards, read `references/card_selection_scoring.md` after deck readiness is known.
- For deck strength and route readiness, read `references/deck_strength_evaluation.md`.
- For card and relic tags, read `data/cards_warrior.yaml` and `data/relic_modifiers.yaml`.
- For unvalidated local learnings, inspect `proposals/` only after official rules are insufficient.
- For regression examples, read `tests/decision_fixtures.yaml`.

## Decision Priorities

Combat:
```text
if a lethal-safe kill exists:
    kill
elif incoming damage is lethal or causes route failure:
    block, weak, potion, or remove the attacking threat
elif enemy has a special layer/damage-cap mechanic:
    spend cheap or multi-hit attacks to remove layers
elif a scaling play is safe before the next attack cycle:
    play scaling
else:
    balance damage, block, setup, and potion conservation
```

Card rewards:
```text
evaluate deck readiness first
score each card against weakness_tags, boss needs, relic synergies, deck pollution, and role saturation
score skip as a real fourth option before comparing cards
if attack_count is already sufficient and weakness_tags lacks damage/aoe:
    penalize additional attacks unless they are premium, synergistic, or solve a known boss/elite
if deck lacks reliable block/control or HP loss is high:
    raise block, weak, draw, and consistency above more frontload
pick only if best_card_score >= skip_score + pick_margin and the card improves the next run segment
otherwise skip
```

Route:
```text
prefer the route that converts current resources into survival plus scaling
avoid elite paths when route_readiness_state is risky or danger unless potion/rest support is clear
value shops when gold can become removal, potions, or a concrete shortboard answer
protect enough HP to reach the act boss with a functional deck, not just to win the next fight
```

## Guardrails

- Do not force an imagined archetype before the deck has survived the current act pressure.
- Do not treat "more damage" as the default answer after the deck already has enough attacks for the next route segment.
- Do not take medium attacks over skip when the real weaknesses are block, control, draw, consistency, or HP preservation.
- Do not pick from card rewards by choosing the least bad card; skip is preferred when no card solves a current or future problem.
- Do not let deck size grow without a compensating reason such as draw, energy, exhaust, removal, or a high-impact solution.
- Do not spend HP for short-term output when the next floors require survival, rest access is distant, or the boss plan is incomplete.
- Do not leave a shop automatically when gold can buy removal, a relevant potion, or a shortboard answer.
- Do not save potions through lethal or large preventable HP loss.
- Do not overvalue medium transition cards once the deck already answers the next route segment.
- Treat proposal files as hypotheses, not official rules, until multiple runs support them.

## Output Format

Use compact decision notes:
```text
Decision: pick/remove/buy/rest/smith/play/route
Need: damage/block/scaling/draw/aoe/control/boss/none
Readiness: strong/acceptable/risky/danger
Reason: one sentence tied to the immediate threat and long-term cost.
```
