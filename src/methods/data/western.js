/**
 * 方法模块 · western 的私有数据表（本目录由西方占卜模块独占）
 *
 * 这里只放**公开资料**：韦特体系 78 张塔罗牌义、Elder Futhark 24 符文义。
 * 不含任何秘传/杜撰内容；各家读法有分歧的地方，取最通行的版本并在 `note` 里写明。
 *
 * ## 元素 → 五行映射（全模块统一）
 * 火 → 火 ｜ 地 → 土 ｜ 风 → 金 ｜ 水 → 水 ｜ 木 → 木（仅用于生命/成长类牌，如皇后、贝卡纳）
 * 该映射是本插件为「与中式 108 法合盘」而做的桥接，不是西方占星/塔罗自身的概念。
 */

/** 西方元素 → 五行（供占星、塔罗、卢恩三处共用）。 */
export const ELEMENT_WX = { 火: '火', 地: '土', 风: '金', 水: '水', 木: '木' }

// ───────────────────────────── 塔罗 78 张 ─────────────────────────────

/**
 * @typedef {object} TarotCard
 * @property {string} name 中文名。
 * @property {string} en 英文名。
 * @property {'大阿卡纳'|'小阿卡纳'} arcana 分类。
 * @property {string|null} suit 花色（小阿卡纳：权杖/圣杯/宝剑/星币；大阿卡纳为 null）。
 * @property {string} el 西方元素（火/地/风/水/木）。
 * @property {string} wx 五行映射。
 * @property {number} us 正位倾向分（-100..100，正 = 顺遂）。
 * @property {number} rs 逆位倾向分（-100..100）。
 * @property {string} up 正位义。
 * @property {string} rev 逆位义。
 */

/**
 * 韦特体系 78 张塔罗。
 * 倾向分是**本插件按牌义吉凶给的公开近似**（不是传统数值），只用于加权合盘，牌义本身为准。
 * @type {TarotCard[]}
 */
export const TAROT = [
  // ── 大阿卡纳 22 张（元素取金色黎明通行配属）──
  { name: '愚者', en: 'The Fool', arcana: '大阿卡纳', suit: null, el: '风', wx: '金', us: 35, rs: -30, up: '启程、纯真、无限可能', rev: '鲁莽、逃避、盲目冒险' },
  { name: '魔术师', en: 'The Magician', arcana: '大阿卡纳', suit: null, el: '风', wx: '金', us: 45, rs: -35, up: '意志、创造、资源在手', rev: '欺瞒、能力未用、操弄' },
  { name: '女祭司', en: 'The High Priestess', arcana: '大阿卡纳', suit: null, el: '水', wx: '水', us: 30, rs: -30, up: '直觉、潜意识、静观其变', rev: '忽视直觉、秘密、表里不一' },
  { name: '皇后', en: 'The Empress', arcana: '大阿卡纳', suit: null, el: '地', wx: '木', us: 50, rs: -30, up: '丰饶、滋养、孕育生长', rev: '依赖、过度保护、创造受阻' },
  { name: '皇帝', en: 'The Emperor', arcana: '大阿卡纳', suit: null, el: '火', wx: '火', us: 40, rs: -35, up: '权威、秩序、稳固根基', rev: '专断、僵化、控制失当' },
  { name: '教皇', en: 'The Hierophant', arcana: '大阿卡纳', suit: null, el: '地', wx: '土', us: 30, rs: -25, up: '传统、指引、正统传承', rev: '教条、叛逆、形式主义' },
  { name: '恋人', en: 'The Lovers', arcana: '大阿卡纳', suit: null, el: '风', wx: '金', us: 50, rs: -35, up: '结合、抉择、价值共鸣', rev: '失衡、诱惑、选择困难' },
  { name: '战车', en: 'The Chariot', arcana: '大阿卡纳', suit: null, el: '水', wx: '水', us: 45, rs: -35, up: '前进、意志驾驭、得胜', rev: '失控、方向不明、急躁' },
  { name: '力量', en: 'Strength', arcana: '大阿卡纳', suit: null, el: '火', wx: '火', us: 45, rs: -35, up: '柔韧克刚、勇气、自制', rev: '自我怀疑、暴躁、力不从心' },
  { name: '隐者', en: 'The Hermit', arcana: '大阿卡纳', suit: null, el: '地', wx: '土', us: 25, rs: -25, up: '内省、求索、独处智慧', rev: '孤僻、固执、逃避人群' },
  { name: '命运之轮', en: 'Wheel of Fortune', arcana: '大阿卡纳', suit: null, el: '火', wx: '火', us: 45, rs: -40, up: '转机、周期、时来运转', rev: '逆转、时运不济、抗拒变化' },
  { name: '正义', en: 'Justice', arcana: '大阿卡纳', suit: null, el: '风', wx: '金', us: 40, rs: -40, up: '公正、因果、权衡得当', rev: '偏私、失衡、逃避责任' },
  { name: '倒吊人', en: 'The Hanged Man', arcana: '大阿卡纳', suit: null, el: '水', wx: '水', us: 15, rs: -30, up: '暂停、换位、以退为进', rev: '徒劳牺牲、拖延、执迷' },
  { name: '死神', en: 'Death', arcana: '大阿卡纳', suit: null, el: '水', wx: '水', us: 25, rs: -40, up: '终结与重生、断舍离', rev: '抗拒结束、停滞、留恋' },
  { name: '节制', en: 'Temperance', arcana: '大阿卡纳', suit: null, el: '火', wx: '火', us: 45, rs: -30, up: '调和、中庸、耐心融合', rev: '失衡、极端、缺乏耐性' },
  { name: '恶魔', en: 'The Devil', arcana: '大阿卡纳', suit: null, el: '地', wx: '土', us: -45, rs: 35, up: '欲望、束缚、执念（警示）', rev: '挣脱枷锁、觉醒、戒断' },
  { name: '塔', en: 'The Tower', arcana: '大阿卡纳', suit: null, el: '火', wx: '火', us: -60, rs: -30, up: '突变、崩解、破而后立', rev: '免于崩塌、延迟的危机、内在动摇' },
  { name: '星星', en: 'The Star', arcana: '大阿卡纳', suit: null, el: '风', wx: '金', us: 50, rs: -30, up: '希望、疗愈、指引', rev: '失望、信心不足、灵感枯竭' },
  { name: '月亮', en: 'The Moon', arcana: '大阿卡纳', suit: null, el: '水', wx: '水', us: -35, rs: 25, up: '幻象、不安、潜意识浮现', rev: '迷雾散去、真相浮现' },
  { name: '太阳', en: 'The Sun', arcana: '大阿卡纳', suit: null, el: '火', wx: '火', us: 65, rs: -25, up: '成功、活力、光明', rev: '暂时受挫、过度乐观、光被遮' },
  { name: '审判', en: 'Judgement', arcana: '大阿卡纳', suit: null, el: '火', wx: '火', us: 50, rs: -30, up: '觉醒、召唤、重新出发', rev: '自我怀疑、逃避召唤、拖延' },
  { name: '世界', en: 'The World', arcana: '大阿卡纳', suit: null, el: '地', wx: '土', us: 65, rs: -25, up: '圆满、完成、整合', rev: '未竟、差一步、收尾乏力' },

  // ── 小阿卡纳 · 权杖（火/火）──
  { name: '权杖一', en: 'Ace of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: 50, rs: -30, up: '灵感迸发、新契机', rev: '起步受阻、动力不足' },
  { name: '权杖二', en: 'Two of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: 25, rs: -25, up: '规划、远眺、抉择', rev: '犹豫、格局受限' },
  { name: '权杖三', en: 'Three of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: 40, rs: -30, up: '拓展、远景成形、等待回报', rev: '延迟、计划落空' },
  { name: '权杖四', en: 'Four of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: 50, rs: -25, up: '庆祝、稳固、团圆', rev: '基础不稳、喜事延后' },
  { name: '权杖五', en: 'Five of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: -25, rs: -20, up: '竞争、摩擦、意见分歧', rev: '内耗、回避冲突' },
  { name: '权杖六', en: 'Six of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: 55, rs: -35, up: '凯旋、认可、领导', rev: '名不副实、失势' },
  { name: '权杖七', en: 'Seven of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: 30, rs: -35, up: '坚守、防御、以寡敌众', rev: '力竭、弃守' },
  { name: '权杖八', en: 'Eight of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: 45, rs: -35, up: '迅速推进、消息传来', rev: '延误、错失时机' },
  { name: '权杖九', en: 'Nine of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: 20, rs: -35, up: '韧性、最后一搏、戒备', rev: '疲惫、疑心过重' },
  { name: '权杖十', en: 'Ten of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: -30, rs: 30, up: '重担、责任过载', rev: '放下、分担、解脱' },
  { name: '权杖侍从', en: 'Page of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: 30, rs: -25, up: '热忱、探索、新消息', rev: '三分钟热度、空想' },
  { name: '权杖骑士', en: 'Knight of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: 40, rs: -35, up: '行动力、冲劲、远行', rev: '鲁莽、半途而废' },
  { name: '权杖王后', en: 'Queen of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: 45, rs: -30, up: '自信、魅力、热情', rev: '嫉妒、专横、不安' },
  { name: '权杖国王', en: 'King of Wands', arcana: '小阿卡纳', suit: '权杖', el: '火', wx: '火', us: 50, rs: -35, up: '愿景、魄力、开创', rev: '独断、急躁、好大喜功' },

  // ── 小阿卡纳 · 圣杯（水/水）──
  { name: '圣杯一', en: 'Ace of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: 55, rs: -35, up: '情感萌芽、爱意、直觉涌动', rev: '情感封闭、失落' },
  { name: '圣杯二', en: 'Two of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: 55, rs: -35, up: '双向结合、互许、和谐', rev: '关系失衡、误解' },
  { name: '圣杯三', en: 'Three of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: 45, rs: -25, up: '欢聚、友谊、共享喜悦', rev: '圈子消耗、过度放纵' },
  { name: '圣杯四', en: 'Four of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: -30, rs: 30, up: '倦怠、视而不见、内省', rev: '重燃兴趣、走出低潮' },
  { name: '圣杯五', en: 'Five of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: -45, rs: 35, up: '失落、遗憾、执著过去', rev: '释怀、重新振作' },
  { name: '圣杯六', en: 'Six of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: 35, rs: -25, up: '旧情、纯真回忆、善意', rev: '困于过去、幼稚' },
  { name: '圣杯七', en: 'Seven of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: -35, rs: 30, up: '幻想、选择过多、迷惑', rev: '看清现实、聚焦' },
  { name: '圣杯八', en: 'Eight of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: 20, rs: -30, up: '转身离开、寻求更深意义', rev: '徘徊不去、逃避' },
  { name: '圣杯九', en: 'Nine of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: 55, rs: -30, up: '心愿达成、满足', rev: '贪求、满足感空虚' },
  { name: '圣杯十', en: 'Ten of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: 60, rs: -40, up: '圆满情感、家庭和乐', rev: '家庭失和、期待落差' },
  { name: '圣杯侍从', en: 'Page of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: 30, rs: -25, up: '柔情、灵感、好消息', rev: '情绪化、逃避现实' },
  { name: '圣杯骑士', en: 'Knight of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: 40, rs: -30, up: '追求、浪漫、诚意', rev: '空头承诺、多情不定' },
  { name: '圣杯王后', en: 'Queen of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: 45, rs: -30, up: '共情、温柔、直觉深', rev: '情绪淹没、过度依赖' },
  { name: '圣杯国王', en: 'King of Cups', arcana: '小阿卡纳', suit: '圣杯', el: '水', wx: '水', us: 45, rs: -30, up: '情感成熟、包容、稳重', rev: '情感压抑、暗中操纵' },

  // ── 小阿卡纳 · 宝剑（风/金）──
  { name: '宝剑一', en: 'Ace of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: 45, rs: -35, up: '清明、突破、真相', rev: '混乱、判断失误' },
  { name: '宝剑二', en: 'Two of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: -25, rs: 30, up: '僵局、回避抉择', rev: '打破僵局、正面面对' },
  { name: '宝剑三', en: 'Three of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: -55, rs: 30, up: '伤心、分离、刺痛', rev: '疗愈、走出伤痛' },
  { name: '宝剑四', en: 'Four of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: 15, rs: -25, up: '休养、沉淀、暂停', rev: '被迫停摆、焦虑' },
  { name: '宝剑五', en: 'Five of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: -45, rs: 25, up: '争胜失和、损人不利己', rev: '和解、放下胜负' },
  { name: '宝剑六', en: 'Six of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: 30, rs: -25, up: '过渡、离开困境、渐入平静', rev: '拖延、旧问题随行' },
  { name: '宝剑七', en: 'Seven of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: -45, rs: 20, up: '欺瞒、取巧、暗中行事', rev: '坦白、被揭穿' },
  { name: '宝剑八', en: 'Eight of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: -40, rs: 35, up: '自我设限、受困', rev: '松绑、重获自由' },
  { name: '宝剑九', en: 'Nine of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: -50, rs: 30, up: '焦虑、失眠、忧惧', rev: '走出阴霾、求助' },
  { name: '宝剑十', en: 'Ten of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: -60, rs: 40, up: '触底、终结、背叛', rev: '谷底反弹、复原' },
  { name: '宝剑侍从', en: 'Page of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: 20, rs: -25, up: '好奇、警觉、探询', rev: '多疑、口舌' },
  { name: '宝剑骑士', en: 'Knight of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: 25, rs: -35, up: '果断、直冲、辩才', rev: '鲁莽、言语伤人' },
  { name: '宝剑王后', en: 'Queen of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: 40, rs: -30, up: '理性、洞察、独立', rev: '冷酷、苛刻' },
  { name: '宝剑国王', en: 'King of Swords', arcana: '小阿卡纳', suit: '宝剑', el: '风', wx: '金', us: 45, rs: -35, up: '权威判断、公正、智略', rev: '专断、滥权' },

  // ── 小阿卡纳 · 星币（地/土）──
  { name: '星币一', en: 'Ace of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 50, rs: -30, up: '实质机会、财源、新起点', rev: '机会流失、投入无回' },
  { name: '星币二', en: 'Two of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 20, rs: -30, up: '灵活周转、兼顾', rev: '失衡、左支右绌' },
  { name: '星币三', en: 'Three of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 40, rs: -25, up: '协作、技艺受认可', rev: '配合不良、品质欠佳' },
  { name: '星币四', en: 'Four of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 15, rs: -25, up: '守成、掌控、稳健', rev: '吝啬、抓得太紧' },
  { name: '星币五', en: 'Five of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: -50, rs: 35, up: '匮乏、孤立、困顿', rev: '转机、获助、走出寒冬' },
  { name: '星币六', en: 'Six of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 35, rs: -25, up: '施与受、公平分配', rev: '施舍失衡、附带条件' },
  { name: '星币七', en: 'Seven of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 20, rs: -30, up: '耐心耕耘、评估收成', rev: '徒劳、回报不如预期' },
  { name: '星币八', en: 'Eight of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 40, rs: -25, up: '专注打磨、技艺精进', rev: '敷衍、重复无成长' },
  { name: '星币九', en: 'Nine of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 50, rs: -25, up: '自足、优雅、独立丰盛', rev: '依赖、表面风光' },
  { name: '星币十', en: 'Ten of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 55, rs: -35, up: '家业、长期稳固、传承', rev: '财务纠纷、家道不稳' },
  { name: '星币侍从', en: 'Page of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 30, rs: -25, up: '学习、务实起步', rev: '拖延、眼高手低' },
  { name: '星币骑士', en: 'Knight of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 35, rs: -25, up: '踏实、可靠、稳步推进', rev: '僵化、进展迟滞' },
  { name: '星币王后', en: 'Queen of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 45, rs: -25, up: '务实滋养、经营有方', rev: '操心过度、忽略自己' },
  { name: '星币国王', en: 'King of Pentacles', arcana: '小阿卡纳', suit: '星币', el: '地', wx: '土', us: 50, rs: -30, up: '富足、稳健、事业有成', rev: '贪婪、固守物质' },
]

// ───────────────────────────── 卢恩 24 符文 ─────────────────────────────

/**
 * @typedef {object} Rune
 * @property {string} name 拉丁转写名。
 * @property {string} sym 符文符号。
 * @property {string} cn 中文音译名。
 * @property {string} mean 字面义/象征。
 * @property {1|2|3} aett 所属埃特（1 弗雷 / 2 海姆达尔 / 3 提尔）。
 * @property {string} el 元素（火/土/风/水/木）。
 * @property {string} wx 五行映射。
 * @property {number} us 正位倾向分。
 * @property {number} rs 逆位（merkstave）倾向分。
 * @property {string} up 正位义。
 * @property {string} rev 逆位义。
 * @property {boolean} [noRev] 传统上不作逆位读的符文（形制对称）。
 */

/** 埃特名。 */
export const AETTIR = { 1: '弗雷', 2: '海姆达尔', 3: '提尔' }

/**
 * Elder Futhark 二十四符文。
 * 逆位读法（merkstave）各家不一，此处取通行的「阻滞/内化/失衡」读法。
 * @type {Rune[]}
 */
export const RUNES = [
  // ── 第一埃特 · 弗雷 ──
  { name: 'Fehu', sym: 'ᚠ', cn: '菲胡', mean: '家畜·可移动的财富', aett: 1, el: '火', wx: '火', us: 50, rs: -35, up: '财富流入、丰盈、新的资源', rev: '财务流失、贪欲、收益受阻' },
  { name: 'Uruz', sym: 'ᚢ', cn: '乌鲁兹', mean: '原牛·未驯的原始力量', aett: 1, el: '土', wx: '土', us: 45, rs: -30, up: '强健、耐力、潜能迸发', rev: '虚弱、错失良机、以蛮力行事' },
  { name: 'Thurisaz', sym: 'ᚦ', cn: '苏里萨兹', mean: '巨人·雷神之锤', aett: 1, el: '火', wx: '火', us: 20, rs: -40, up: '突破障碍、防护、催化变化', rev: '冲突、危险、被迫改变' },
  { name: 'Ansuz', sym: 'ᚨ', cn: '安苏兹', mean: '神祇·口才与神谕', aett: 1, el: '风', wx: '金', us: 40, rs: -30, up: '讯息、灵感、贵人指点', rev: '误解、谎言、讯息延误' },
  { name: 'Raidho', sym: 'ᚱ', cn: '莱多', mean: '骑行·旅程与节奏', aett: 1, el: '风', wx: '金', us: 40, rs: -30, up: '旅程、节奏、方向正确', rev: '受阻、计划打乱、失序' },
  { name: 'Kenaz', sym: 'ᚲ', cn: '肯纳兹', mean: '火炬·受控的火', aett: 1, el: '火', wx: '火', us: 35, rs: -30, up: '照亮、技艺、灵感之火', rev: '熄灭、创意枯竭、关系转淡' },
  { name: 'Gebo', sym: 'ᚷ', cn: '盖博', mean: '礼物·交换与结盟', aett: 1, el: '风', wx: '金', us: 45, rs: -25, noRev: true, up: '馈赠、结盟、公平交换', rev: '交易失衡、依附、代价' },
  { name: 'Wunjo', sym: 'ᚹ', cn: '温约', mean: '喜悦·氏族之和乐', aett: 1, el: '土', wx: '土', us: 50, rs: -30, up: '和乐、归属、心愿顺遂', rev: '失望、疏离、乐极生悲' },

  // ── 第二埃特 · 海姆达尔 ──
  { name: 'Hagalaz', sym: 'ᚺ', cn: '哈格拉兹', mean: '冰雹·不可抗的天候', aett: 2, el: '水', wx: '水', us: -45, rs: -25, noRev: true, up: '突变、清理、不可抗力', rev: '缓和的考验、内在震荡' },
  { name: 'Nauthiz', sym: 'ᚾ', cn: '瑙提兹', mean: '需求·困厄与克制', aett: 2, el: '火', wx: '火', us: -35, rs: 30, up: '匮乏、克制、必要的忍耐', rev: '解脱、学会取舍、走出困局' },
  { name: 'Isa', sym: 'ᛁ', cn: '伊萨', mean: '冰·冻结与静止', aett: 2, el: '水', wx: '水', us: -40, rs: 25, noRev: true, up: '停滞、冻结、静待时机', rev: '融解、松动、局面开始流动' },
  { name: 'Jera', sym: 'ᛃ', cn: '耶拉', mean: '年岁·丰收的周期', aett: 2, el: '土', wx: '土', us: 50, rs: -20, noRev: true, up: '收成、周期回报、应得之果', rev: '迟来的回报、时机未到' },
  { name: 'Eihwaz', sym: 'ᛇ', cn: '艾瓦兹', mean: '紫杉·生死之桥', aett: 2, el: '土', wx: '土', us: 25, rs: -30, noRev: true, up: '转化、坚韧、穿越考验', rev: '逃避转变、方向感缺失' },
  { name: 'Perthro', sym: 'ᛈ', cn: '佩索', mean: '骰盅·命运与未知', aett: 2, el: '水', wx: '水', us: 20, rs: -30, noRev: true, up: '未知、机缘、秘密揭晓', rev: '秘密藏不住、赌注失手' },
  { name: 'Algiz', sym: 'ᛉ', cn: '阿尔吉兹', mean: '麋鹿角·庇护', aett: 2, el: '风', wx: '金', us: 45, rs: -35, noRev: true, up: '护佑、警觉、与更高处连结', rev: '失去庇护、轻信、防护松懈' },
  { name: 'Sowilo', sym: 'ᛊ', cn: '索维罗', mean: '太阳·光与指引', aett: 2, el: '火', wx: '火', us: 60, rs: -20, noRev: true, up: '成功、光明、方向明确', rev: '光被遮蔽、短暂挫败' },

  // ── 第三埃特 · 提尔 ──
  { name: 'Tiwaz', sym: 'ᛏ', cn: '提瓦兹', mean: '战神提尔·正义', aett: 3, el: '风', wx: '金', us: 45, rs: -35, up: '正义、胜利、担当', rev: '不公、失信、牺牲无果' },
  { name: 'Berkano', sym: 'ᛒ', cn: '贝卡纳', mean: '桦树女神·生育与生长', aett: 3, el: '木', wx: '木', us: 50, rs: -30, up: '生长、孕育、新的开始', rev: '停滞、成长受阻、疏于照料' },
  { name: 'Ehwaz', sym: 'ᛖ', cn: '埃瓦兹', mean: '马·信赖与同行', aett: 3, el: '土', wx: '土', us: 40, rs: -30, up: '合作、稳步前行、信任', rev: '伙伴失和、进展迟滞' },
  { name: 'Mannaz', sym: 'ᛗ', cn: '曼纳兹', mean: '人·自我与社群', aett: 3, el: '风', wx: '金', us: 35, rs: -30, up: '社群、自知、互助', rev: '孤立、自我怀疑、被人算计' },
  { name: 'Laguz', sym: 'ᛚ', cn: '拉古兹', mean: '水流·直觉与情感', aett: 3, el: '水', wx: '水', us: 35, rs: -30, up: '直觉、流动、情感涌现', rev: '情绪泛滥、误判、停滞' },
  { name: 'Ingwaz', sym: 'ᛜ', cn: '英瓦兹', mean: '丰饶神英格·蓄势', aett: 3, el: '土', wx: '土', us: 45, rs: -25, noRev: true, up: '蓄势、内在成长、孕育成果', rev: '压抑、能量堵滞' },
  { name: 'Dagaz', sym: 'ᛞ', cn: '达加兹', mean: '黎明·昼夜之交', aett: 3, el: '火', wx: '火', us: 55, rs: -20, noRev: true, up: '破晓、转机、突破', rev: '迟迟未明、反复' },
  { name: 'Othala', sym: 'ᛟ', cn: '奥萨拉', mean: '祖产·家园与传承', aett: 3, el: '土', wx: '土', us: 45, rs: -30, up: '家业、根基、传承', rev: '家宅不安、失去依靠' },
]
