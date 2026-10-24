// Adapted decision guidance, not a replacement for live game mechanics.
// Original skill and references are preserved under strategy/upstream/.
export const strategyInfo=Object.freeze({name:'AI Slay the Spire 2',repository:'https://github.com/mxnklimt/AI_slaythespire',commit:'904b6f59b98a6cfd77b4ae26f72f2746e4a97025',mode:'adapted_reference'});

const readiness=[
  '先用实机卡组、血量、药水、遗物诊断：前期输出、防御、成长、抽牌与费用、群攻、控制和精英/Boss解法。指出最重要的1～3个短板，不预设最终流派。',
  '准备度用 strong/acceptable/risky/danger 作主观分档，必须结合当前牌的效果与费用给证据；没有战斗历史时不能声称近期战损很高或关键牌经常沉底。',
  '把未来可见的3～5层视为一段路线，比较血量、可靠回复、药水、休息/商店可达性和已知Boss需求。地图缺失时说明缺失，不虚构期望损血、概率或未来奖励。',
  '攻击已经足够时，继续拿中等攻击会稀释关键牌；要重新检查防御、控制、运转与成长。低血时优先兑现生存价值，而非依赖尚不存在的组件。',
  '薄卡组不是绝对目标。缺乏即时输出或生存答案时，可以拿能明确解决近期威胁的过渡牌；避免为了跳过而跳过。',
];
const byKind={
  card_reward:[
    '先确定短板，再逐一比较所有候选。若 options 中有 skip，必须把跳过作为正式候选；若没有，不得假定可以跳过。',
    '加入卡牌须明确做到至少一项：补短板、降低下一段战损、解决已知精英/Boss机制、改善抽牌费用、形成已有组件的高质量协同。仅仅“这张牌不差”或“多一点伤害”不足以拿牌。',
    '比较即时输出、防御、成长、抽牌费用、减益、群攻、实际协同与问题解决价值；扣除费用卡手、角色饱和、关键牌稀释、升级依赖及兑现时机的代价。',
    '参考原文对18/22张等厚度节点和重复中等攻击的警示，但这些是经验信号，不是强制阈值；考虑已有抽牌、能量、消耗与实际角色。',
    '牌组能回答下一段路线且候选无明显净收益时偏向跳过；早期缺伤害或低血缺生存时，提高真正能解决问题的牌的优先级。',
  ],
  map:[
    '路线是资源组合，不是精英越多越好，也不是问号天然安全。比较未来3～5层的强制战斗、休息、升级、购物和已知Boss需求。',
    '精英须同时评估卡组准备度、血量、药水的实际用途及后续补给；缺输出、防御或回复支持时降低贪精英的倾向。',
    '商店价值取决于金币是否可转化为删牌、关键药水或短板答案。只能选择 options 中的合法连线路线；规则损血估算不能替代实际卡组判断。',
  ],
  shop:[
    '离店前比较所有具体购买与留钱的价值：删牌、药水、补短板卡牌、有效遗物。不能因为没有想象中的核心组件而默认离店，也不能为了花钱而买牌。',
    '删牌通常先审视诅咒、低质量基础攻击、多余防御和不协同过渡牌；缺伤害不能盲删攻击，缺防御不能盲删防御。说明实际删牌目标。',
    '精英或Boss前能显著补齐生存/爆发答案的药水，可能优于普通卡牌。按实际价格、金币和药水空栏安排购买顺序；已购买后的手动重评只看当前剩余商品。',
  ],
  rest_site:[
    '比较休息的实际净回复（考虑溢出）与升级能否改变下一段生存、费用、关键层数、核心循环和Boss窗口。休息不是默认动作，也不能为了长期成长忽略迫近的致命压力。',
    '血线危险且缺可靠防御/药水答案时提高休息权重；血量足够、卡组能回答下一段路线且关键升级有明显收益时偏向锻造。原文血量阈值仅作启发，不能机械执行。',
    '不要默认升级痛击或最贵牌。比较游戏导出的升级前后费用、描述与关键词，优先真正改变当前瓶颈的升级；不能编造未导出的效果。',
  ],
  card_select:[
    '先依据 selection_constraints 区分事件加入牌组与升级。加入牌组时比较整组卡牌的近期收益、费用曲线、互补与冗余，严格选够实机要求的张数，不能套用升级选择规则。',
    '升级选择比较实际升级前后的费用、关键层数、输出/防御阈值和核心稳定性；结合已有遗物的实机效果，选当前可用的具体目标。',
  ],
  event:[
    '把事件选项的已知血量、金币、诅咒、卡牌与遗物代价映射到当前短板和下一段路线；随机收益只按已知描述比较，不虚构概率或未知事件结局。',
  ],
};
const references={card_reward:['references/card_selection_scoring.md'],map:['references/broken_star_sts_strategy.md'],shop:['references/broken_star_sts_strategy.md'],rest_site:['references/broken_star_sts_strategy.md'],card_select:['references/broken_star_sts_strategy.md'],event:[]};

export function decisionReference(state,options){
  return {
    ...strategyInfo,
    references:['SKILL.md','references/deck_strength_evaluation.md',...(references[state.kind]??[])],
    priorities:['当前实机事实与合法选项','当前用户的辅助建议范围与输出格式','外部策略参考'],
    limits:[
      '本内容是原 skill 的适配摘要。保持本助手的 JSON 输出，不采用上游的文本输出格式或自动操作工作流。',
      '不加载 proposals 中未验证假设，不把原文经验权重当作校准过的强度、损血或胜率模型。',
      '上游主要含战士风格经验；其他角色仅迁移通用思路。卡名标签、遗物触发和Boss机制仅在实机描述支持时适用。',
    ],
    readiness_workflow:readiness,
    scene_rules:byKind[state.kind]??[],
    skip_is_legal:options.some(o=>o.id==='skip'),
    explanation:'在 reasons 中用简短中文交代主要短板、主观准备度及本次选择如何改善下一段路线；不要输出未定义的新顶层字段。',
  };
}
