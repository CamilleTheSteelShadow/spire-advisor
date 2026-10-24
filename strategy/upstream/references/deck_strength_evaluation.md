# 《杀戮尖塔2》当前卡组强度评估

用途：在路线选择、选牌、商店、营火、药水使用前，评估当前卡组能否应对下一段关卡压力。
核心原则：卡组强度不是静态总分，而是“当前资源能否回答下一段地图提出的问题”。如果评估显示打不过，就允许抓过渡牌、买药水、走营火、避开精英或优先休息。

## 1. 输出结果

每次评估输出 5 类信息：

```text
deck_power_score: 当前综合强度
survival_score: 当前生存能力
route_readiness_score: 对下一段路线的数值准备度
route_readiness_state: strong / acceptable / risky / danger
weakness_tags: 需要补的短板标签
```

推荐格式：

```text
DeckStrength:
  deck_power_score = 68
  survival_score = 54
  route_readiness_score = 61
  route_readiness_state = risky
  weakness_tags = [block, draw, aoe]
  action_hint = avoid_elite_or_take_transition_card
```

## 2. 总公式

```text
deck_power_score =
    w_frontload       * frontload_score
  + w_block           * block_score
  + w_scaling         * scaling_score
  + w_consistency     * consistency_score
  + w_aoe             * aoe_score
  + w_control         * control_score
  + w_relic           * relic_score
  + w_potion          * potion_score
  + w_economy         * economy_score
  - w_bloat           * bloat_penalty
  - w_clunk           * clunk_penalty
  - w_upgrade_debt    * upgrade_debt_penalty
```

```text
survival_score =
    deck_power_score
  + hp_score
  + next_rest_site_score
  + potion_emergency_score
  - incoming_route_risk
```

```text
route_readiness_score =
    survival_score
  + matchup_bonus
  - matchup_penalty
```

```text
route_readiness_state =
    strong if route_readiness_score >= 80
    acceptable if 65 <= route_readiness_score < 80
    risky if 50 <= route_readiness_score < 65
    danger if route_readiness_score < 50
```

## 3. 默认参数

初始参数如下，后续根据复盘调整：

```text
w_frontload = 1.10
w_block = 1.30
w_scaling = 0.95
w_consistency = 1.25
w_aoe = 0.85
w_control = 0.90
w_relic = 0.80
w_potion = 0.75
w_economy = 0.35

w_bloat = 1.35
w_clunk = 1.00
w_upgrade_debt = 0.85
```

## 4. 分阶段权重

### Act 1 前半

目标：用前期输出打普通怪，准备精英/Boss。

```text
w_frontload += 0.35
w_block -= 0.05
w_scaling -= 0.25
w_aoe += 0.10
w_consistency -= 0.05
```

### Act 1 后半

目标：不只会打伤害，还要有防御、易伤/虚弱、少量成长。

```text
w_frontload += 0.10
w_block += 0.20
w_scaling += 0.10
w_consistency += 0.10
```

### Act 2

目标：能处理群怪、高额爆发和防御压力。

```text
w_block += 0.30
w_aoe += 0.35
w_consistency += 0.25
w_control += 0.15
```

### Act 3

目标：稳定抽到关键牌，针对 Boss 机制，有足够成长。

```text
w_scaling += 0.30
w_consistency += 0.35
w_control += 0.15
w_bloat += 0.25
```

## 5. 单项分数

### frontload_score

衡量前 1-3 回合杀怪能力。

```text
frontload_score =
    efficient_attack_count * 12
  + cheap_attack_count * 6
  + multi_hit_count * 8
  + vulnerable_access * 10
  + early_strength_access * 10
  + expected_turn1_damage * 0.6
```

修正：

```text
if Act 1 and efficient_attack_count < 2:
    frontload_score -= 20
if deck_has_only_expensive_damage:
    frontload_score -= 15
if attacks_require_setup:
    frontload_score -= 10
```

### block_score

衡量能否回答敌人攻击轮。

```text
block_score =
    efficient_block_count * 12
  + weak_access * 14
  + block_engine_value
  + burst_block_score
  + average_block_per_cycle * 0.7
```

修正：

```text
if no_good_block_beyond_basic_defend:
    block_score -= 18
if hp_ratio < 0.55:
    block_score -= 10 unless strong_block_available
if block_cards_are_expensive_and_no_energy:
    block_score -= 12
```

### burst_block_score

衡量单回合大额格挡阈值，尤其用于精英/Boss 重击、臂甲类遗物、以及“第一张格挡牌翻倍”机制。

```text
burst_block_score =
    high_single_card_block_count * 10
  + first_block_multiplier_value
  + block_upgrade_threshold_value
```

修正：

```text
if relic_has_first_block_multiplier and has_reliable_single_card_block:
    burst_block_score += 18
if relic_has_first_block_multiplier and only_small_block_cards:
    burst_block_score += 6
if burst_block_card_is_expensive_and_no_energy:
    burst_block_score -= 8
```

### scaling_score

衡量长战和 Boss 能力。

```text
scaling_score =
    strength_scaling * 14
  + vulnerable_reliability * 10
  + power_engine_value
  + exhaust_or_self_damage_engine_value
  + long_fight_damage_growth
```

修正：

```text
if no_scaling_after_floor_10:
    scaling_score -= 20
if scaling_is_slow_and_hp_low:
    scaling_score -= 15
if scaling_card_needs_upgrade:
    upgrade_debt_penalty += 8
```

### consistency_score

衡量关键牌命中率、过牌、费用和牌组厚度。

```text
consistency_score =
    draw_count * 10
  + energy_support_count * 10
  + retain_or_topdeck_control * 8
  + card_remove_count * 6
  - deck_size_penalty
```

默认牌组厚度惩罚：

```text
if deck_size <= 15: deck_size_penalty = 0
if 16 <= deck_size <= 18: deck_size_penalty = 8
if 19 <= deck_size <= 22: deck_size_penalty = 18
if deck_size >= 23: deck_size_penalty = 30
```

### aoe_score

衡量多怪战能力。

```text
aoe_score =
    reliable_aoe_count * 18
  + splash_or_random_damage_value
  + multi_target_relic_value
```

修正：

```text
if Act 2 and reliable_aoe_count == 0:
    aoe_score -= 25
if only_aoe_is_expensive_and_no_energy:
    aoe_score -= 10
```

### control_score

包括虚弱、易伤、人工控制牌顶、消耗状态、移除威胁等。

```text
control_score =
    weak_access * 12
  + vulnerable_access * 10
  + exhaust_status_access * 8
  + target_control_or_scry_like_value
```

### relic_score

```text
relic_score =
    combat_relic_value
  + energy_relic_value
  + draw_relic_value
  + block_relic_value
  + economy_relic_value * route_shop_factor
```

### potion_score

药水不是收藏品，而是路线强度的一部分。

```text
potion_score =
    damage_potion_value
  + block_or_weak_potion_value
  + energy_or_copy_potion_value
  + draw_potion_value
```

修正：

```text
if next_node_is_elite_or_boss and has_relevant_potion:
    potion_score += 15
if potion_slots_full:
    future_potion_value -= 8
```

### economy_score

```text
economy_score =
    gold / 10
  + shop_access_soon * 12
  + removal_need * shop_access_soon * 8
```

## 6. 惩罚项

### bloat_penalty

牌组变厚会降低关键牌命中率。

```text
bloat_penalty =
    max(0, deck_size - target_deck_size) * 4
  + low_impact_card_count * 5
  + curse_or_status_card_count * 12
```

默认：

```text
target_deck_size = 15 in Act 1
target_deck_size = 18 in Act 2
target_deck_size = 20 in Act 3
```

### clunk_penalty

```text
clunk_penalty =
    expensive_card_count_without_energy * 10
  + upgrade_dependent_card_count * 6
  + combo_only_card_count * 8
```

### upgrade_debt_penalty

```text
upgrade_debt_penalty =
    key_upgrade_needed_count * 8
  - available_safe_smith_count * 6
```

最低为 0。

## 7. 路线准备度阈值

根据 `route_readiness_score` 派生 `route_readiness_state`，再决定下一步策略。

```text
route_readiness_score >= 80:
    strong
    can_take_elite
    can_skip_medium_cards
    prefer_smith_or_long_term_power_if_hp_not_critical

65 <= route_readiness_score < 80:
    acceptable
    take_elite_only_with_potion_or_rest_after
    pick_clear_problem_solvers
    if hp_ratio healthy and boss_damage_window_answered:
        lean_smith_over_rest

50 <= route_readiness_score < 65:
    risky
    avoid_elite_if_possible
    take_transition_cards
    value_shop_potion_or_rest

route_readiness_score < 50:
    danger
    prioritize_survival
    rest_over_smith
    buy_potions_or_block
    avoid_elite_and_extra_monsters
```

## 8. 短板标签

评估后生成 `weakness_tags`，供选牌评分调用。

```text
if frontload_score < frontload_threshold:
    add "damage"

if block_score < block_threshold:
    add "block"

if scaling_score < scaling_threshold and boss_or_late_act_soon:
    add "scaling"

if consistency_score < consistency_threshold:
    add "draw"

if aoe_score < aoe_threshold and (Act >= 2 or multi_enemy_route_soon):
    add "aoe"

if control_score < control_threshold:
    add "control"

if burst_block_score < burst_block_threshold and elite_or_boss_heavy_hit_soon:
    add "elite_survival"
```

默认阈值：

```text
frontload_threshold = 45
block_threshold = 42
scaling_threshold = 35
consistency_threshold = 35
aoe_threshold = 25
control_threshold = 20
burst_block_threshold = 18
```

## 9. 如何影响选牌

`deck_strength_evaluation.md` 负责判断短板，`card_selection_scoring.md` 负责给候选牌打分。

映射规则：

```text
if route_readiness_state == strong:
    skip_score += 20
    transition_card_score -= 10

if route_readiness_state == acceptable:
    pick_only_clear_problem_solver_or_high_quality_card

if route_readiness_state == risky:
    matching_weakness_tag_card += 20
    transition_card += 15
    greedy_scaling_card -= 15

if route_readiness_state == danger:
    matching_survival_card += 30
    potion_or_shop_value += 20
    slow_card -= 25
    skip_score -= 10 for cards that solve immediate survival
```

例子：

```text
weakness_tags = [damage]
=> 低费攻击、群攻、多段攻击加分；慢能力牌和纯后期组件降分。

weakness_tags = [block, draw]
=> 优质防御、虚弱、抽牌、费用加分；第 4 张普通攻击降分。

route_readiness_state = strong
=> 普通攻击即使能打，也通常不拿；skip 变强。
```

## 10. 营火、商店、精英决策联动

### 营火

```text
if route_readiness_score < 50 or hp_ratio < 0.55 before elite_or_boss:
    rest
elif route_readiness_score >= 80 and hp_ratio >= 0.60 and deck_has_answers_for_next_several_floors:
    smith_or_other_long_term_value
elif route_readiness_score >= 65 and hp_ratio >= 0.70 and boss_damage_window_answered:
    lean_smith_over_rest
elif upgrade_debt_penalty is high and survival_score >= 65:
    smith key card
else:
    choose rest/smith by next_route_risk
```

解释：

- 休息不是默认安全动作；当卡组强度已经大概率足以通过接下来的数层与 Boss 关键轮次时，营火更应该转换成长期强度。
- 这里的“长期强度”包括：升级关键牌、保留高质量血线去吃更值的节点、以及避免因为过度补血错失质变敲位。

### 商店

```text
if weakness_tags contains block:
    prioritize efficient_block, weak, block_potion

if weakness_tags contains damage:
    prioritize efficient_attack, aoe, damage_potion

if consistency_score low:
    prioritize remove Strike/curse, draw, energy, card control

if route_readiness_state == strong and deck bloated:
    prioritize remove over medium card
```

### 精英

```text
if route_readiness_score >= 80:
    elite_ok
elif route_readiness_score >= 65 and has_relevant_potion and rest_after:
    elite_ok_but_watch_hp
else:
    avoid_elite
```

## 11. 复盘记录格式

每次关键选择后，可以用这个格式记录，方便长期调参：

```text
version:
date:
floor:
act:
hp:
deck_size:
relics:
potions:
deck_power_score:
survival_score:
route_readiness_score:
route_readiness_state:
weakness_tags:
decision:
result:
adjustment_note:
```

## 12. 当前版本记录

```text
version: 0.1
date: 2026-05-15
changed_parameters: initial deck strength framework
reason: separate deck readiness evaluation from card reward scoring
observed_result: pending
next_adjustment: compare predicted route_readiness_score/state with actual HP loss over several Act 1 routes
```

## 13. 2026-05-17 整体副本论修正

目标不是赢下一场战斗，而是以足够资源通过整段路线并击败 Act Boss。评估强度时必须加入“未来 3-5 层战损预算”和“关键牌命中率”。

### 13.1 路线段评估

```text
segment_survival_budget =
    current_hp
  + expected_rest_heal
  + expected_relic_heal
  + potion_prevention_value
  - expected_hp_loss_next_3_to_5_floors

if segment_survival_budget is low:
    route_readiness_state worsens by one tier
    weakness_tags add block/control/draw
```

不要只看当前战斗能否靠爆发打赢；若赢完后血线无法承受后续强制精英、普通怪或 Boss，则当前路线准备度仍然不合格。

### 13.2 攻防比例诊断

```text
if usable_attack_count >= 4 and efficient_block_count <= 2:
    block_score -= 15
    consistency_score -= 10
    weakness_tags add block
    weakness_tags add control

if deck_size >= 18 and draw_count == 0:
    consistency_score -= 20
    weakness_tags add draw

if deck_has_multiple_expensive_attacks and no_energy_support:
    clunk_penalty += 20
```

攻击数量足够后，新的普通攻击不会明显提高通过率；它更常见的代价是稀释防御、运转和关键爆发牌。

### 13.3 低血与精英门槛

```text
if hp_ratio < 0.65 and next_node_is_elite and not has_strong_block_or_potion:
    avoid_elite

if hp_ratio < 0.55 and rest_site_available:
    rest unless lethal boss clock requires a key smith

if hp_ratio < 0.45:
    survival_score -= 25
    slow_scaling_score -= 20
    hp_cost_cards become emergency-only
```

高输出不能抵消低血带来的路线失败风险。低血时，防御、虚弱、药水、休息和删牌的价值应显式上升。

### 13.4 强度判断输出补充

在常规输出中额外记录：

```text
attack_saturation = low/ok/high
defense_reliability = weak/ok/strong
key_card_density = healthy/diluted
segment_survival_budget = safe/tight/failing
```

当 `attack_saturation = high` 且 `defense_reliability != strong` 时，卡牌奖励默认偏向防御、控制、抽牌、删牌或 skip。

```text
version: 0.2
date: 2026-05-17
changed_parameters: frontload weight down; block, consistency, and bloat weights up; added segment survival and attack saturation checks
reason: prevent over-building damage while losing the run to HP loss, deck bloat, and poor key-card density
observed_result: pending
next_adjustment: validate against future Act 2 elite and boss outcomes
```
