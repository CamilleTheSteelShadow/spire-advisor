# 《杀戮尖塔2》选牌评分细则

用途：给 AI 自动驾驶时的卡牌奖励选择提供可调、可长期更新的评分框架。
核心原则：卡牌奖励不是三选一，而是“三张牌 + skip 四选一”。只有当最佳卡牌分数明显高于跳过分数时才拿牌。

使用顺序：先用同目录 `deck_strength_evaluation.md` 评估当前卡组强度，得到 `route_readiness_score`、`route_readiness_state` 和 `weakness_tags`；再用本文给卡牌奖励打分。

## 1. 总公式

对每张候选牌计算：

```text
card_score =
    w_damage          * damage_score
  + w_block           * block_score
  + w_scaling         * scaling_score
  + w_draw_energy     * draw_energy_score
  + w_debuff          * debuff_score
  + w_aoe             * aoe_score
  + w_exhaust         * exhaust_score
  + w_synergy         * synergy_score
  + w_problem         * problem_solution_score
  + w_boss            * boss_solution_score
  - w_cost            * cost_penalty
  - w_pollution       * deck_pollution_penalty
  - w_upgrade         * upgrade_dependency_penalty
  - w_timing          * timing_penalty
```

同时计算：

```text
skip_score =
    base_skip
  + skip_deck_size_bonus
  + skip_stability_bonus
  + skip_no_problem_bonus
  + skip_route_safety_bonus
```

最终决策：

```text
best_card = max(card_score)

if best_card >= skip_score + pick_margin:
    pick best_card
else:
    skip
```

## 2. 默认参数

这些参数不是定论，是当前版本的初始值。后续每把复盘时可以调。

```text
base_skip = 10
pick_margin = 14

w_damage = 0.90
w_block = 1.10
w_scaling = 1.10
w_draw_energy = 1.10
w_debuff = 1.05
w_aoe = 1.00
w_exhaust = 0.70
w_synergy = 1.00
w_problem = 1.30
w_boss = 1.40

w_cost = 1.00
w_pollution = 1.65
w_upgrade = 0.85
w_timing = 1.00
```

## 3. 阶段参数

不同阶段调权重，而不是换一套逻辑。

### Act 1 前半

目标是活过普通怪、准备第一精英或 Boss。

```text
w_damage += 0.35
w_aoe += 0.15
w_scaling -= 0.20
w_draw_energy -= 0.10
w_problem += 0.20
pick_margin = 8
```

### Act 1 后半

如果已有 2-3 张可用攻击，开始抬高防御、成长和运转。

```text
w_damage -= 0.10
w_block += 0.20
w_scaling += 0.15
w_draw_energy += 0.15
pick_margin = 12
```

### Act 2

重点是群体战、爆发攻击、稳定防御和运转。

```text
w_aoe += 0.35
w_block += 0.25
w_draw_energy += 0.25
w_problem += 0.25
pick_margin = 14
```

### Act 3

重点是稳定性、Boss 特解、关键牌命中率。

```text
w_draw_energy += 0.35
w_boss += 0.35
w_pollution += 0.30
pick_margin = 17
```

## 4. 需求诊断

先诊断牌组缺什么，再给牌加 `problem_solution_score`。

### 缺输出

满足任一条件：

- Act 1 前 3 个奖励后，可用攻击少于 2 张。
- 普通怪经常拖到第 4 回合以后。
- 面对多怪时只能逐个普攻。

修正：

```text
efficient_attack: +25
cheap_multi_hit: +25
aoe_attack: +20
expensive_single_hit: +10
slow_power: -10
```

### 缺防御

满足任一条件：

- 面对 12-18 点攻击经常只能硬吃。
- 防御牌只有基础防御，且没有虚弱/易伤控制。
- 当前 HP 低于 65%，路线还有普通怪/精英。

修正：

```text
efficient_block: +25
weak_or_attack_down: +30
block_plus_damage_engine: +20
expensive_block_without_draw: -10
```

### 缺成长

满足任一条件：

- 打 Boss 没有力量、易伤、能力或持续收益。
- 长战只能靠基础攻击重复磨。

修正：

```text
reliable_strength: +25
reliable_vulnerable: +20
safe_power: +20
slow_power_under_low_hp: -20
```

### 缺运转

满足任一条件：

- 牌组超过 18 张且没有抽牌/检索。
- 关键牌经常沉底。
- 费用经常打不完手牌。

修正：

```text
draw: +20
energy_gain: +18
retain_or_discovery: +15
expensive_card: -15
deck_pollution_penalty += 10
skip_score += 15
```

## 5. 单项分数定义

### damage_score

```text
damage_score = expected_damage
```

修正：

```text
if card_cost == 0: damage_score += 5
if card_cost == 1 and expected_damage >= 8: damage_score += 6
if multi_hit: damage_score += 6
if needs_setup_to_deal_damage: damage_score -= 8
```

### block_score

```text
block_score = expected_block
```

修正：

```text
if card_cost == 1 and expected_block >= 8: block_score += 6
if block_scales_with_existing_engine: block_score += 8
if only_good_after_combo: block_score -= 8
```

### scaling_score

```text
scaling_score =
    strength_value * 8
  + permanent_or_combat_long_value
  + repeatable_engine_value
```

修正：

```text
if card_is_power and current_hp_pressure_high: scaling_score -= 12
if scaling_is_immediate_or_low_cost: scaling_score += 8
if scaling_needs_multiple_other_cards: scaling_score -= 12
```

### draw_energy_score

```text
draw_energy_score =
    cards_drawn * 7
  + energy_generated * 9
  + card_selection_or_topdeck_control * 6
```

修正：

```text
if draw_is_delayed: draw_energy_score -= 5
if draw_requires_exhaust_or_discard_synergy_not_present: draw_energy_score -= 10
```

### deck_pollution_penalty

```text
deck_pollution_penalty =
    base_card_added_penalty
  + duplicate_role_penalty
  + draw_dilution_penalty
```

默认：

```text
base_card_added_penalty = 6

if deck_size >= 16: base_card_added_penalty += 4
if deck_size >= 18: base_card_added_penalty += 8
if deck_size >= 22: base_card_added_penalty += 12

if card_role_already_saturated: duplicate_role_penalty = 10
else: duplicate_role_penalty = 0

if card_is_low_impact_common: draw_dilution_penalty = 8
else: draw_dilution_penalty = 0
```

## 6. Skip 加分

`skip` 在以下情况主动加分：

```text
if deck_size >= 18:
    skip_deck_size_bonus += 15
if deck_size >= 22:
    skip_deck_size_bonus += 25

if deck_already_solves_next_route_pressure:
    skip_route_safety_bonus += 20

if deck_has_high_probability_to_pass_next_several_floors:
    skip_route_safety_bonus += 15

if no_card_solves_current_problem:
    skip_no_problem_bonus += 25

if deck_needs_to_draw_key_cards_more_often:
    skip_stability_bonus += 15

if all_cards_are_upgrade_dependent and smiths_are_tight:
    skip_no_problem_bonus += 10

if rewards_are_only_medium_transition_cards_without_scaling_or_synergy:
    skip_no_problem_bonus += 15

if repeated_picks_would_make_deck_more_mixed_but_not_more_cohesive:
    skip_stability_bonus += 15
```

注意：前 3 个奖励仍然可以拿普通攻击，但不是无脑拿。若第一、第二个奖励完全没有合格攻击，低费防御或跳过都可能比幻想牌更好。
进一步强调：AI 不应把“现在能打一点输出”误判为“值得永久加入牌组”；如果一张牌只是在补一口过渡数值，却不能提升牌组结构、协同或 Boss 质量，默认更接近 skip。

## 7. 低血和路线修正

当前血量会影响“现在能不能兑现价值”。

```text
hp_ratio = current_hp / max_hp

if hp_ratio < 0.35:
    w_timing += 0.50
    w_block += 0.35
    w_scaling -= 0.35
    slow_card_penalty += 20

if hp_ratio < 0.55:
    w_block += 0.25
    w_problem += 0.20
    upgrade_dependency_penalty += 8

if next_node_is_elite_or_boss:
    w_problem += 0.30
    w_boss += 0.25
    slow_card_penalty += 10
```

## 8. 遗物与标签修正

卡牌基础标签建议从 `../data/cards_warrior.yaml` 读取；遗物局部修正建议从 `../data/relic_modifiers.yaml` 读取。不要把局部遗物收益写成全局权重，除非多局复盘证明它稳定成立。

```text
if relic_has_first_block_multiplier and card_tags contains burst_block:
    block_score += 18
    upgrade_dependency_penalty -= 4 if upgrade_crosses_block_threshold

if relic_has_first_block_multiplier and card_tags contains small_block:
    block_score += 6

if relic_has_first_block_multiplier and card_tags contains only_block and card_cost >= 2:
    cost_penalty -= 4 only if current weakness_tags contains block or elite_survival
```

## 9. Boss 与机制修正

Boss 或特殊敌人已知时，给特解额外加分。

```text
if boss_has_slippery_or_damage_cap:
    cheap_attack += 15
    multi_hit += 25
    expensive_single_hit -= 25
    vulnerable_setup += 10 only if layers_can_be_removed_soon

if boss_demands_fast_damage:
    efficient_attack += 20
    slow_power -= 15

if boss_demands_block_turns:
    efficient_block += 20
    weak += 25

if boss_demands_scaling:
    reliable_scaling += 25
```

## 10. 决策输出格式

AI 每次选牌时，建议记录一行简短理由，方便复盘调参。

```text
Reward: [A, B, C]
Need: damage/block/scaling/draw/aoe/control/boss/none
Scores: A=32, B=18, C=-4, skip=25, margin=10
Decision: pick A
Reason: A solves immediate damage and is cheap; skip not high enough.
```

若跳过：

```text
Reward: [A, B, C]
Need: draw/stability
Scores: A=12, B=8, C=6, skip=30, margin=10
Decision: skip
Reason: no card solves the current problem; deck already has enough attacks.
```

## 11. 调参规则

每次失败或明显亏损后，只改 1-3 个参数，避免一次性大改导致无法归因。

优先复盘这些问题：

- 是否因为拿了低质量牌导致关键牌抽不到。
- 是否因为过度 skip 导致 Act 1 输出不足。
- 是否因为贪成长牌导致低血死亡。
- 是否因为忽略 Boss 机制，拿了不适配的高分牌。
- 是否因为低估药水、商店、营火，导致选牌承担了不该承担的任务。

推荐维护方式：

```text
version:
date:
changed_parameters:
reason:
observed_result:
next_adjustment:
```

## 12. 当前版本记录

```text
version: 0.1
date: 2026-05-15
changed_parameters: initial scoring framework
reason: make skip a first-class option and separate card scoring from the main strategy document
observed_result: pending
next_adjustment: review after several Act 1 runs
```

## 13. 2026-05-17 攻防与跳过修正

本节覆盖默认直觉：AI 容易高估攻击牌和低估 skip。执行时优先套用这些门槛，再看细分分数。

### 13.1 攻击饱和门槛

```text
if usable_attack_count >= 4 and weakness_tags does not contain damage/aoe/boss_solution:
    generic_attack -= 25
    expensive_single_hit -= 30
    second_or_later_attack_same_role -= 20

if attack_count > efficient_block_count + 2:
    generic_attack -= 20
    block_or_weak_or_draw += 20
    skip_score += 15
```

拿攻击牌必须能说明它解决了哪个问题：缺输出、缺群攻、Boss 特解、多段破机制，或与现有力量/易伤形成高质量闭环。只因为“能打伤害”不够。

### 13.2 防御与战损门槛

```text
if hp_ratio < 0.60 or recent_fights_lost_high_hp:
    w_block += 0.35
    weak_or_attack_down += 25
    draw_or_energy_that_finds_block += 15
    hp_cost_card_penalty += 20

if Act >= 2 and no_reliable_block_package:
    efficient_block += 30
    weak_or_attack_down += 30
    generic_attack -= 15
```

防御不是“有空再补”的项目。若上一段路线靠硬吃伤害通关，下一次选牌默认先问：这张牌能否降低未来 3-5 层的战损。

### 13.3 强化 skip 的触发条件

```text
if deck_size >= 18:
    skip_score += 20
if deck_size >= 22:
    skip_score += 35
if no_candidate_is_a_clear_problem_solver:
    skip_score += 30
if candidate_is_only_medium_transition_value:
    candidate_score -= 20
if route_readiness_state in [strong, acceptable] and card_is_not_premium:
    skip_score += 20
if key_card_density_is_declining:
    skip_score += 25
```

默认把卡牌奖励视为“四选一”。只有当候选牌能净提升下一段副本通过率时才拿；否则跳过是在保护关键牌命中率。

### 13.4 最低拿牌理由

拿牌前必须至少满足一项：

- 明确补当前 `weakness_tags`。
- 明确降低未来路线战损。
- 明确提高 Boss 或精英机制解法。
- 明确改善运转，使关键牌更容易被抽到或打出。
- 明确形成高质量协同，且不依赖幻想中的后续组件。

若理由只是“这张牌不差”“现在能用”“多一点输出”，倾向 skip。

```text
version: 0.2
date: 2026-05-17
changed_parameters: base_skip 5->10, pick_margin 12->14, damage weight down, block/draw/pollution weights up
reason: reduce attack over-picking, make skip a real default, and protect long-run deck consistency
observed_result: pending
next_adjustment: compare card reward decisions against HP loss and key-card draw consistency across Act 2
```
