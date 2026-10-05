/**
 * 术数内核 · 108 法注册表
 *
 * 这是整个插件的**契约表**：每一条 = 一种术法，声明它由哪个引擎算、需要什么输入、
 * 保真度如何、在合盘里占多大权重。方法模块只管实现引擎，不再各自定义元信息。
 *
 * ## fidelity 三档（诚实标记，会出现在输出里）
 * - `full`   公开算法完整实现（历法、卦、小六壬、称骨、掷筊…）
 * - `core`   核心公开算法实现，部分细节按通例取值（奇门局数、六壬课体、紫微安星…）
 * - `approx` 缺秘传表/大辞书，按公开可推部分近似（铁板类神数、七政四余、签诗辞、
 *            面相手相）。**输出里会标 ⚠**，不冒充实测。
 *
 * ## need 字段
 * 声明该方法需要哪些输入；缺了就不算，并在合盘里记为「未起」（不占权重、不计票）。
 *
 * @typedef {object} Entry
 * @property {number} no 1..108
 * @property {string} id 稳定英文 id
 * @property {string} name 中文名
 * @property {string} cat 分类
 * @property {string} module 所属方法模块
 * @property {string} engine 引擎名（模块内导出同名函数）
 * @property {'full'|'core'|'approx'} fidelity
 * @property {number} weight 合盘权重
 * @property {string[]} need 需要的输入项
 * @property {object} params 引擎参数
 * @property {string} note 一句话说明
 */

/** 分类顺序（输出分组用）。 */
export const CATEGORIES = ['易卦', '三式', '六壬', '命理', '择时', '风水', '签卜', '杂占', '姓名', '相术', '西方']

/** @type {Entry[]} */
export const ENTRIES = [
  // ───────────── 易卦 24 ─────────────
  { no: 1, id: 'dayan', name: '大衍筮法', cat: '易卦', module: 'yijing', engine: 'yarrow', fidelity: 'full', weight: 1.2, need: [], params: {}, note: '五十蓍草去一，三变成爻，十八变成卦' },
  { no: 2, id: 'jinqian', name: '金钱卦', cat: '易卦', module: 'yijing', engine: 'coinHex', fidelity: 'full', weight: 1.1, need: [], params: {}, note: '三枚铜钱六掷，背数定阴阳老少' },
  { no: 3, id: 'liuyao', name: '六爻纳甲', cat: '易卦', module: 'yijing', engine: 'najia', fidelity: 'full', weight: 1.3, need: [], params: { topic: 'general' }, note: '京房纳甲，装卦配六亲六神，以世应断' },
  { no: 4, id: 'liuyao-shiying', name: '六爻·世应六亲', cat: '易卦', module: 'yijing', engine: 'shiying', fidelity: 'full', weight: 1.1, need: [], params: {}, note: '专看世应关系与六亲旺衰' },
  { no: 5, id: 'meihua-time', name: '梅花·时间卦', cat: '易卦', module: 'yijing', engine: 'meihua', fidelity: 'full', weight: 1.2, need: [], params: { mode: 'time' }, note: '年支+月+日+时数起卦，体用生克' },
  { no: 6, id: 'meihua-num', name: '梅花·报数卦', cat: '易卦', module: 'yijing', engine: 'meihua', fidelity: 'full', weight: 1.2, need: ['numbers'], params: { mode: 'number' }, note: '报数起卦' },
  { no: 7, id: 'meihua-waiying', name: '梅花·外应卦', cat: '易卦', module: 'yijing', engine: 'meihua', fidelity: 'full', weight: 1.0, need: [], params: { mode: 'waiying' }, note: '以时地外物取数起卦' },
  { no: 8, id: 'meihua-zi', name: '梅花·字占', cat: '易卦', module: 'yijing', engine: 'meihua', fidelity: 'full', weight: 1.0, need: [], params: { mode: 'word' }, note: '以所问之字笔画起卦' },
  { no: 9, id: 'meihua-tiyong', name: '梅花·体用生克', cat: '易卦', module: 'yijing', engine: 'tiyong', fidelity: 'full', weight: 1.2, need: [], params: {}, note: '专断体用五行生克与互变' },
  { no: 10, id: 'jingfang', name: '京房易传·八宫', cat: '易卦', module: 'yijing', engine: 'palace', fidelity: 'full', weight: 1.0, need: [], params: {}, note: '八宫卦序、世应、飞伏' },
  { no: 11, id: 'huozhulin', name: '火珠林古法', cat: '易卦', module: 'yijing', engine: 'huozhulin', fidelity: 'core', weight: 1.0, need: [], params: {}, note: '以钱代蓍的古法六爻，重日月建' },
  { no: 12, id: 'wenwang', name: '文王卦·用神法', cat: '易卦', module: 'yijing', engine: 'yongshen', fidelity: 'core', weight: 1.2, need: [], params: {}, note: '按所问事类取用神，判旺衰生克' },
  { no: 13, id: 'yilin', name: '焦氏易林·卦变', cat: '易卦', module: 'yijing', engine: 'yilin', fidelity: 'core', weight: 0.8, need: [], params: {}, note: '本卦之变卦，4096 林辞按卦象推' },
  { no: 14, id: 'taixuan', name: '太玄数', cat: '易卦', module: 'yijing', engine: 'taixuan', fidelity: 'core', weight: 0.7, need: [], params: {}, note: '扬雄太玄八十一首，三方九州二十七部' },
  { no: 15, id: 'yuanbao', name: '元包数', cat: '易卦', module: 'yijing', engine: 'yuanbao', fidelity: 'approx', weight: 0.5, need: [], params: {}, note: '卫元嵩元包，以坤为首' },
  { no: 16, id: 'qianxu', name: '潜虚数', cat: '易卦', module: 'yijing', engine: 'qianxu', fidelity: 'approx', weight: 0.5, need: [], params: {}, note: '司马光潜虚，五十五名' },
  { no: 17, id: 'huangji', name: '皇极经世', cat: '易卦', module: 'yijing', engine: 'huangji', fidelity: 'core', weight: 0.7, need: [], params: {}, note: '元会运世，以先天卦气推大运' },
  { no: 18, id: 'heluo-yi', name: '河洛理数·先天卦', cat: '易卦', module: 'yijing', engine: 'heluo', fidelity: 'core', weight: 0.8, need: [], params: {}, note: '河图洛书数化卦' },
  { no: 19, id: 'lingqi', name: '灵棋经', cat: '易卦', module: 'yijing', engine: 'lingqi', fidelity: 'approx', weight: 0.6, need: [], params: {}, note: '十二棋掷三组，成课断吉凶' },
  { no: 20, id: 'xiantian-yi', name: '先天易数', cat: '易卦', module: 'yijing', engine: 'xiantian', fidelity: 'core', weight: 0.8, need: [], params: {}, note: '先天八卦数起卦' },
  { no: 21, id: 'daxiang', name: '大象占', cat: '易卦', module: 'yijing', engine: 'daxiang', fidelity: 'full', weight: 0.9, need: [], params: {}, note: '以八卦类象（天泽火雷风水山地）取象' },
  { no: 22, id: 'yaoci', name: '爻辞占', cat: '易卦', module: 'yijing', engine: 'yaoci', fidelity: 'approx', weight: 0.9, need: [], params: {}, note: '独发之爻取爻辞，多动取彖（无爻辞文本库，改为可引用的爻位义例：当位/得中/相应）',
    fidelityNote: 'v2 由 core 降 approx：本插件不内置《周易》384 爻辞原文，无可靠来源时不伪造辞句，只按爻位义例（当位/得中/相应/位二多誉等）出结构性断语。升回 core 的条件是接入可溯源的爻辞文本库。' },
  { no: 23, id: 'zhigua', name: '之卦占', cat: '易卦', module: 'yijing', engine: 'zhigua', fidelity: 'full', weight: 1.0, need: [], params: {}, note: '本卦→变卦，看事之趋向' },
  { no: 24, id: 'huagua', name: '互卦占', cat: '易卦', module: 'yijing', engine: 'huagua', fidelity: 'full', weight: 0.9, need: [], params: {}, note: '互卦看事之中间过程' },

  // ───────────── 三式 15 ─────────────
  { no: 25, id: 'qimen-shi', name: '奇门遁甲·时家', cat: '三式', module: 'sanshi', engine: 'qimen', fidelity: 'core', weight: 1.3, need: [], params: { scale: '时', pan: '转盘' }, note: '时家转盘，九星八门八神三奇六仪' },
  { no: 26, id: 'qimen-fei', name: '奇门遁甲·飞盘', cat: '三式', module: 'sanshi', engine: 'qimen', fidelity: 'core', weight: 1.1, need: [], params: { scale: '时', pan: '飞盘' }, note: '飞盘奇门，九星飞布' },
  { no: 27, id: 'qimen-ri', name: '奇门遁甲·日家', cat: '三式', module: 'sanshi', engine: 'qimen', fidelity: 'core', weight: 1.0, need: [], params: { scale: '日', pan: '转盘' }, note: '日家奇门，以日干支起局' },
  { no: 28, id: 'qimen-yue', name: '奇门遁甲·月家', cat: '三式', module: 'sanshi', engine: 'qimen', fidelity: 'approx', weight: 0.7, need: [], params: { scale: '月', pan: '转盘' }, note: '月家奇门' },
  { no: 29, id: 'qimen-nian', name: '奇门遁甲·年家', cat: '三式', module: 'sanshi', engine: 'qimen', fidelity: 'approx', weight: 0.6, need: [], params: { scale: '年', pan: '转盘' }, note: '年家奇门' },
  { no: 30, id: 'qimen-ju', name: '奇门·局数法', cat: '三式', module: 'sanshi', engine: 'qimenJu', fidelity: 'core', weight: 0.9, need: [], params: {}, note: '超接置闰、阴阳遁局数、旬首符头' },
  { no: 31, id: 'daliuren', name: '大六壬·四课三传', cat: '三式', module: 'sanshi', engine: 'liuren', fidelity: 'core', weight: 1.3, need: [], params: {}, note: '月将加时，天地盘，四课三传' },
  { no: 32, id: 'liuren-ke', name: '大六壬·课体', cat: '三式', module: 'sanshi', engine: 'liurenKe', fidelity: 'core', weight: 1.0, need: [], params: {}, note: '九宗门课体判定（贼克涉害昴星…）' },
  { no: 33, id: 'liuren-jiang', name: '大六壬·十二天将', cat: '三式', module: 'sanshi', engine: 'liurenJiang', fidelity: 'core', weight: 0.9, need: [], params: {}, note: '贵人起法，十二天将布盘' },
  { no: 34, id: 'taiyi', name: '太乙神数·九宫', cat: '三式', module: 'sanshi', engine: 'taiyi', fidelity: 'core', weight: 1.0, need: [], params: {}, note: '太乙行九宫，主客算数' },
  { no: 35, id: 'taiyi-ji', name: '太乙·计神算', cat: '三式', module: 'sanshi', engine: 'taiyiJi', fidelity: 'approx', weight: 0.7, need: [], params: {}, note: '计神、主客大将、参将' },
  { no: 36, id: 'xiaoliuren', name: '小六壬', cat: '六壬', module: 'sanshi', engine: 'xiaoliuren', fidelity: 'full', weight: 1.0, need: [], params: {}, note: '月日时掐指，六宫轮转' },
  { no: 37, id: 'zhongliuren', name: '中六壬', cat: '六壬', module: 'sanshi', engine: 'zhongliuren', fidelity: 'core', weight: 0.8, need: [], params: {}, note: '月将加时的小六壬扩展' },
  { no: 38, id: 'jinkoujue', name: '六壬金口诀', cat: '六壬', module: 'sanshi', engine: 'jinkoujue', fidelity: 'core', weight: 0.9, need: [], params: {}, note: '地分、月将、贵神、人元四位' },
  { no: 39, id: 'maqianke', name: '马前课', cat: '六壬', module: 'sanshi', engine: 'maqianke', fidelity: 'core', weight: 0.7, need: [], params: {}, note: '诸葛马前课，六宫定数' },
  { no: 40, id: 'sanchuan', name: '三传九宗', cat: '六壬', module: 'sanshi', engine: 'sanchuan', fidelity: 'core', weight: 0.9, need: [], params: {}, note: '初传中传末传的取法与吉凶' },

  // ───────────── 命理 18 ─────────────
  { no: 41, id: 'bazi-pan', name: '四柱八字·排盘', cat: '命理', module: 'mingli', engine: 'baziPan', fidelity: 'full', weight: 1.3, need: ['birth'], params: {}, note: '年月日时四柱、藏干、十神、纳音' },
  { no: 42, id: 'bazi-wangshuai', name: '八字·日主旺衰', cat: '命理', module: 'mingli', engine: 'baziWangShuai', fidelity: 'full', weight: 1.2, need: ['birth'], params: {}, note: '得令得地得势，判身强身弱' },
  { no: 43, id: 'bazi-shishen', name: '八字·十神格局', cat: '命理', module: 'mingli', engine: 'baziShiShen', fidelity: 'full', weight: 1.1, need: ['birth'], params: {}, note: '十神分布、格局取用' },
  { no: 44, id: 'bazi-yongshen', name: '八字·用神取法', cat: '命理', module: 'mingli', engine: 'baziYongShen', fidelity: 'core', weight: 1.2, need: ['birth'], params: {}, note: '扶抑/调候/通关取用神' },
  { no: 45, id: 'bazi-dayun', name: '八字·大运流年', cat: '命理', module: 'mingli', engine: 'baziDaYun', fidelity: 'full', weight: 1.1, need: ['birth'], params: {}, note: '起运岁数、大运排布、流年干支' },
  { no: 46, id: 'bazi-shensha', name: '八字·神煞', cat: '命理', module: 'mingli', engine: 'baziShenSha', fidelity: 'full', weight: 0.9, need: ['birth'], params: {}, note: '驿马桃花华盖将星天乙贵人' },
  { no: 47, id: 'nayin', name: '纳音论命', cat: '命理', module: 'mingli', engine: 'nayin', fidelity: 'full', weight: 0.8, need: ['birth'], params: {}, note: '六十甲子纳音五行论命' },
  { no: 48, id: 'changsheng', name: '十二长生·命宫', cat: '命理', module: 'mingli', engine: 'changsheng', fidelity: 'full', weight: 0.9, need: ['birth'], params: {}, note: '胎元命宫身宫、十二长生' },
  { no: 49, id: 'ziwei-anxing', name: '紫微斗数·安星', cat: '命理', module: 'mingli', engine: 'ziweiAnxing', fidelity: 'core', weight: 1.2, need: ['birth'], params: {}, note: '安命身十二宫、紫微天府十四主星' },
  { no: 50, id: 'ziwei-sihua', name: '紫微斗数·四化', cat: '命理', module: 'mingli', engine: 'ziweiSiHua', fidelity: 'core', weight: 1.1, need: ['birth'], params: {}, note: '生年四化、飞星四化' },
  { no: 51, id: 'ziwei-sanfang', name: '紫微·三方四正', cat: '命理', module: 'mingli', engine: 'ziweiSanFang', fidelity: 'core', weight: 1.0, need: ['birth'], params: {}, note: '本宫三方四正会照' },
  { no: 52, id: 'ziwei-daxian', name: '紫微·大限流年', cat: '命理', module: 'mingli', engine: 'ziweiDaXian', fidelity: 'core', weight: 1.0, need: ['birth'], params: {}, note: '大限起止、流年命宫' },
  { no: 53, id: 'qizheng', name: '七政四余', cat: '命理', module: 'mingli', engine: 'qizheng', fidelity: 'core', weight: 0.7, need: ['birth'], params: {}, note: '日月五星四余躔度（v2：真星历 astronomy-engine 视黄经；四余按平交点/近地点推）',
    fidelityNote: 'v2 由 approx 升 core：原无星历表只能按 J2000 平均黄经推，现用 vendor/astronomy.cjs 的真黄经；引擎在缺 chart.astro 时自行降回 approx' },
  { no: 54, id: 'wuxing-zhan', name: '五星占', cat: '命理', module: 'mingli', engine: 'wuxingZhan', fidelity: 'core', weight: 0.6, need: ['birth'], params: {}, note: '五星聚散与五行配属（v2：用真黄经算黄经差判聚散）',
    fidelityNote: 'v2 由 approx 升 core：理由同 #53' },
  { no: 55, id: 'xiu28-ming', name: '二十八宿命度', cat: '命理', module: 'mingli', engine: 'xiu28Ming', fidelity: 'core', weight: 0.8, need: ['birth'], params: {}, note: '以生日定值宿与命度' },
  { no: 56, id: 'chenggu', name: '称骨算命', cat: '命理', module: 'mingli', engine: 'chenggu', fidelity: 'full', weight: 0.7, need: ['birth'], params: {}, note: '袁天罡称骨，年月日时骨重相加' },
  { no: 57, id: 'heluo-minggua', name: '河洛命卦', cat: '命理', module: 'mingli', engine: 'heluoMingGua', fidelity: 'full', weight: 0.8, need: ['birth'], params: {}, note: '九星命卦，定东四命西四命' },
  { no: 58, id: 'shengxiao', name: '生肖命理', cat: '命理', module: 'mingli', engine: 'shengxiao', fidelity: 'full', weight: 0.7, need: ['birth'], params: {}, note: '生肖刑冲合害、太岁关系' },

  // ───────────── 择时 14 ─────────────
  { no: 59, id: 'huangli', name: '黄历宜忌', cat: '择时', module: 'zeri', engine: 'huangli', fidelity: 'full', weight: 1.1, need: [], params: {}, note: '通书宜忌、吉神凶煞、彭祖百忌' },
  { no: 60, id: 'jianchu', name: '建除十二神', cat: '择时', module: 'zeri', engine: 'jianchu', fidelity: 'full', weight: 1.0, need: [], params: {}, note: '建除满平定执破危成收开闭' },
  { no: 61, id: 'xiu28-zeri', name: '二十八宿择日', cat: '择时', module: 'zeri', engine: 'xiu28Zeri', fidelity: 'full', weight: 0.9, need: [], params: {}, note: '值宿吉凶与宜忌' },
  { no: 62, id: 'huangheidan', name: '黄黑道择日', cat: '择时', module: 'zeri', engine: 'huangHeiDao', fidelity: 'full', weight: 1.0, need: [], params: {}, note: '青龙明堂等十二值神' },
  { no: 63, id: 'donggong', name: '董公择日', cat: '择时', module: 'zeri', engine: 'donggong', fidelity: 'core', weight: 0.9, need: [], params: {}, note: '董公选要，重月建与凶煞叠加' },
  { no: 64, id: 'yanggong', name: '杨公十三忌', cat: '择时', module: 'zeri', engine: 'yanggong', fidelity: 'full', weight: 0.8, need: [], params: {}, note: '杨筠松十三忌日' },
  { no: 65, id: 'wuyun-liuqi', name: '五运六气', cat: '择时', module: 'zeri', engine: 'wuyunLiuqi', fidelity: 'core', weight: 0.8, need: [], params: {}, note: '岁运、司天在泉、客气加临' },
  { no: 66, id: 'taisui', name: '太岁三煞', cat: '择时', module: 'zeri', engine: 'taisui', fidelity: 'core', weight: 0.9, need: [], params: {}, note: '太岁、岁破、三煞、五黄方位' },
  { no: 67, id: 'zibai', name: '紫白九星择日', cat: '择时', module: 'zeri', engine: 'zibai', fidelity: 'core', weight: 0.9, need: [], params: {}, note: '年月日时紫白飞星' },
  { no: 68, id: 'qimen-zeshi', name: '奇门择时', cat: '择时', module: 'zeri', engine: 'qimenZeShi', fidelity: 'core', weight: 1.0, need: [], params: {}, note: '择三奇得使、门吉星吉之时' },
  { no: 69, id: 'liuyao-zeri', name: '六曜择日', cat: '择时', module: 'zeri', engine: 'liuyaoZeri', fidelity: 'full', weight: 0.8, need: [], params: {}, note: '先胜友引先负仏灭大安赤口' },
  { no: 70, id: 'zhishen', name: '十二值神', cat: '择时', module: 'zeri', engine: 'zhiShen', fidelity: 'full', weight: 0.9, need: [], params: {}, note: '黄道黑道十二神值日吉凶' },
  { no: 71, id: 'jishi', name: '择吉时', cat: '择时', module: 'zeri', engine: 'jiShi', fidelity: 'core', weight: 0.9, need: [], params: {}, note: '一日之内十二时辰的吉凶排序' },
  { no: 72, id: 'ze-ri', name: '综合择日', cat: '择时', module: 'zeri', engine: 'zeRi', fidelity: 'core', weight: 1.0, need: [], params: {}, note: '多体系叠加，给未来 30 日吉凶排序' },

  // ───────────── 风水 10 ─────────────
  { no: 73, id: 'bazhai', name: '八宅明镜', cat: '风水', module: 'fengshui', engine: 'bazhai', fidelity: 'full', weight: 1.0, need: [], params: {}, note: '东四命西四命，八宅九星方位' },
  { no: 74, id: 'xuankong-yun', name: '玄空·运盘', cat: '风水', module: 'fengshui', engine: 'xuankongYun', fidelity: 'core', weight: 1.0, need: [], params: {}, note: '三元九运，当运星入中飞布' },
  { no: 75, id: 'xuankong-shanxiang', name: '玄空·山向飞星', cat: '风水', module: 'fengshui', engine: 'xuankongShanXiang', fidelity: 'core', weight: 1.0, need: [], params: {}, note: '山星向星飞布，旺山旺向判定' },
  { no: 76, id: 'sanhe', name: '三合派·二十四山', cat: '风水', module: 'fengshui', engine: 'sanhe', fidelity: 'core', weight: 0.9, need: [], params: {}, note: '三合水法、十二长生水口' },
  { no: 77, id: 'sanyuan', name: '三元派·三般卦', cat: '风水', module: 'fengshui', engine: 'sanyuan', fidelity: 'approx', weight: 0.7, need: [], params: {}, note: '父母三般卦、连珠三般卦' },
  { no: 78, id: 'jiuxing-shuifa', name: '九星水法', cat: '风水', module: 'fengshui', engine: 'jiuxingShuiFa', fidelity: 'approx', weight: 0.7, need: [], params: {}, note: '辅弼武贪巨禄文廉破，来去水吉凶' },
  { no: 79, id: 'yangzhai', name: '阳宅三要', cat: '风水', module: 'fengshui', engine: 'yangzhai', fidelity: 'core', weight: 0.9, need: [], params: {}, note: '门主灶三者相生相克' },
  { no: 80, id: 'xingshi', name: '形势派·四灵', cat: '风水', module: 'fengshui', engine: 'xingshi', fidelity: 'core', weight: 0.8, need: [], params: {}, note: '青龙白虎朱雀玄武四灵格局' },
  { no: 81, id: 'luopan', name: '罗盘二十四山', cat: '风水', module: 'fengshui', engine: 'luopan', fidelity: 'full', weight: 0.8, need: [], params: {}, note: '二十四山向、八卦分宫、空亡' },
  { no: 82, id: 'fenjin', name: '六十甲子分金', cat: '风水', module: 'fengshui', engine: 'fenjin', fidelity: 'core', weight: 0.7, need: [], params: {}, note: '坐度分金、孤虚龟甲空亡' },

  // ───────────── 签卜 8 ─────────────
  { no: 83, id: 'qian-guanyin', name: '观音灵签', cat: '签卜', module: 'zhanbu', engine: 'qian', fidelity: 'approx', weight: 0.8, need: [], params: { system: '观音' }, note: '观音一百签；无签谱文件时出签号签级与卦象断' },
  { no: 84, id: 'qian-guandi', name: '关帝灵签', cat: '签卜', module: 'zhanbu', engine: 'qian', fidelity: 'approx', weight: 0.8, need: [], params: { system: '关帝' }, note: '关帝一百签' },
  { no: 85, id: 'qian-yuelao', name: '月老灵签', cat: '签卜', module: 'zhanbu', engine: 'qian', fidelity: 'approx', weight: 0.7, need: [], params: { system: '月老' }, note: '月老六十签，重姻缘' },
  { no: 86, id: 'qian-luzu', name: '吕祖灵签', cat: '签卜', module: 'zhanbu', engine: 'qian', fidelity: 'approx', weight: 0.8, need: [], params: { system: '吕祖' }, note: '吕祖一百签' },
  { no: 87, id: 'qian-huangdaxian', name: '黄大仙灵签', cat: '签卜', module: 'zhanbu', engine: 'qian', fidelity: 'approx', weight: 0.8, need: [], params: { system: '黄大仙' }, note: '黄大仙一百签' },
  { no: 88, id: 'qian-mazu', name: '妈祖灵签', cat: '签卜', module: 'zhanbu', engine: 'qian', fidelity: 'approx', weight: 0.8, need: [], params: { system: '妈祖' }, note: '妈祖六十签' },
  { no: 89, id: 'qian-chegong', name: '车公灵签', cat: '签卜', module: 'zhanbu', engine: 'qian', fidelity: 'approx', weight: 0.7, need: [], params: { system: '车公' }, note: '车公九十六签' },
  { no: 90, id: 'jiao', name: '掷筊', cat: '签卜', module: 'zhanbu', engine: 'jiao', fidelity: 'full', weight: 0.9, need: [], params: {}, note: '三掷定圣杯笑杯哭杯' },

  // ───────────── 杂占 8 ─────────────
  { no: 91, id: 'mibua', name: '米卦', cat: '杂占', module: 'zhanbu', engine: 'mibua', fidelity: 'full', weight: 0.7, need: [], params: {}, note: '抓米三撮计数起卦' },
  { no: 92, id: 'cezi-bihua', name: '测字·笔画', cat: '杂占', module: 'zhanbu', engine: 'ceziBiHua', fidelity: 'full', weight: 0.9, need: [], params: {}, note: '以所问字笔画数起卦' },
  { no: 93, id: 'cezi-chaizi', name: '测字·拆字', cat: '杂占', module: 'zhanbu', engine: 'ceziChaiZi', fidelity: 'core', weight: 0.8, need: [], params: {}, note: '拆字取象，观字形偏旁五行' },
  { no: 94, id: 'zhougong', name: '周公解梦', cat: '杂占', module: 'zhanbu', engine: 'zhougong', fidelity: 'approx', weight: 0.7, need: [], params: {}, note: '梦象五行归类断吉凶' },
  { no: 95, id: 'niao-zhan', name: '鸟占', cat: '杂占', module: 'zhanbu', engine: 'niaoZhan', fidelity: 'approx', weight: 0.5, need: [], params: {}, note: '鸦鸣方位时辰占' },
  { no: 96, id: 'yantiao', name: '眼跳占', cat: '杂占', module: 'zhanbu', engine: 'yanTiao', fidelity: 'core', weight: 0.6, need: [], params: {}, note: '左眼右眼按时辰占吉凶' },
  { no: 97, id: 'pentishi', name: '喷嚏占', cat: '杂占', module: 'zhanbu', engine: 'penTi', fidelity: 'core', weight: 0.5, need: [], params: {}, note: '喷嚏时辰占' },
  { no: 98, id: 'wuyin', name: '五音占', cat: '杂占', module: 'zhanbu', engine: 'wuYin', fidelity: 'core', weight: 0.6, need: [], params: {}, note: '宫商角徵羽配五行，以声占事' },

  // ───────────── 姓名 4 ─────────────
  { no: 99, id: 'wuge', name: '五格剖象', cat: '姓名', module: 'xiangxing', engine: 'wuGe', fidelity: 'core', weight: 0.8, need: [], params: {}, note: '天格人格地格外格总格，五格数理' },
  { no: 100, id: 'sancai', name: '三才配置', cat: '姓名', module: 'xiangxing', engine: 'sanCai', fidelity: 'core', weight: 0.8, need: [], params: {}, note: '天人地三才五行配置吉凶' },
  { no: 101, id: 'shengxiao-xingming', name: '生肖姓名学', cat: '姓名', module: 'xiangxing', engine: 'shengXiaoName', fidelity: 'core', weight: 0.7, need: [], params: {}, note: '生肖喜忌部首' },
  { no: 102, id: 'bazi-xingming', name: '八字姓名补益', cat: '姓名', module: 'xiangxing', engine: 'baziName', fidelity: 'core', weight: 0.8, need: ['birth'], params: {}, note: '以八字用神补名字五行' },

  // ───────────── 相术 2 ─────────────
  { no: 103, id: 'mianxiang', name: '面相十二宫', cat: '相术', module: 'xiangxing', engine: 'mianXiang', fidelity: 'approx', weight: 0.6, need: [], params: {}, note: '命宫财帛兄弟等十二宫部位' },
  { no: 104, id: 'shouxiang', name: '手相掌纹', cat: '相术', module: 'xiangxing', engine: 'shouXiang', fidelity: 'approx', weight: 0.6, need: [], params: {}, note: '生命线智慧线感情线三大主线' },

  // ───────────── 西方 4 ─────────────
  { no: 105, id: 'xingzuo', name: '西洋占星·本命', cat: '西方', module: 'western', engine: 'astroNatal', fidelity: 'core', weight: 0.9, need: ['birth'], params: {}, note: '日月升三要素、星座宫位' },
  { no: 106, id: 'hepan', name: '西洋占星·合盘', cat: '西方', module: 'western', engine: 'astroSynastry', fidelity: 'approx', weight: 0.7, need: [], params: {}, note: '双方星盘相位比较' },
  { no: 107, id: 'tarot', name: '塔罗·三牌阵', cat: '西方', module: 'western', engine: 'tarot', fidelity: 'core', weight: 0.9, need: [], params: { spread: 'three' }, note: '过去现在未来三牌' },
  { no: 108, id: 'rune', name: '卢恩符文', cat: '西方', module: 'western', engine: 'rune', fidelity: 'core', weight: 0.7, need: [], params: {}, note: '二十四符文单抽，正逆位' },
]

/** id → 条目。 */
export const ENTRY_BY_ID = Object.fromEntries(ENTRIES.map((e) => [e.id, e]))
/** no → 条目。 */
export const ENTRY_BY_NO = Object.fromEntries(ENTRIES.map((e) => [e.no, e]))

/** 按分类分组。 */
export function entriesByCategory() {
  const out = {}
  for (const c of CATEGORIES) out[c] = ENTRIES.filter((e) => e.cat === c)
  return out
}

/** 保真度说明（输出里给模型看的）。 */
export const FIDELITY_LABEL = {
  full: '全算法',
  core: '核心算法',
  approx: '近似（缺秘传表/辞书）',
}

/**
 * 自检：编号连续、id 唯一、分类合法、引擎声明齐全。
 * @returns {string[]} 问题列表（空数组 = 通过）。
 */
export function validateRegistry() {
  const problems = []
  const ids = new Set()
  for (const e of ENTRIES) {
    if (ids.has(e.id)) problems.push(`id 重复: ${e.id}`)
    ids.add(e.id)
    if (!CATEGORIES.includes(e.cat)) problems.push(`分类非法: ${e.id} → ${e.cat}`)
    if (!e.engine) problems.push(`缺 engine: ${e.id}`)
    if (!['full', 'core', 'approx'].includes(e.fidelity)) problems.push(`fidelity 非法: ${e.id}`)
    if (!(e.weight > 0)) problems.push(`权重非法: ${e.id}`)
  }
  if (ENTRIES.length !== 108) problems.push(`条目数应为 108，实为 ${ENTRIES.length}`)
  ENTRIES.forEach((e, i) => {
    if (e.no !== i + 1) problems.push(`编号不连续: 第 ${i + 1} 项 no=${e.no}`)
  })
  return problems
}
