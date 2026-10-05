/**
 * dsh-divination-108 —— 客户端那一半：右下角悬浮的「108 术数合盘」面板。
 *
 * ## 形态来自哪里（都是本机实测样本，不是文档推测）
 *
 * - **slot**：`shell.overlay`，`kind: 'list'`、`scope: 'root'`、`replaceRisk: 'none'`
 *   —— 「Frame-wide floating layer, above every column and outside their scroll
 *   containers」，正是悬浮窗该待的地方，且是**追加型**（不会遮掉别人的 UI）。
 *   注册选项 `id` 必填、`order` 可选、`label` 可选。
 * - **包壳**：`window.__ModuleLoader__.load({ id, factory })`，`id` 必须等于包名
 *   （宿主加载后校验 `bundle … loaded without registering "<id>"`）。
 * - **`require` 面**：只 require `react`（平台种子表里的白名单模块之一）。
 * - **写/读通道**：宿主用 `connection.fetch` 注册的 `/api/...` 端点。它位于官方 `/api`
 *   前缀处理器**之后**，鉴权（Host/Origin 栅栏 + 签名 cookie）由宿主完成；页面同源
 *   `fetch` 会自动带上 cookie。
 *
 * ## 配色
 * 只依赖 `currentColor` 与中性 `rgba()` 底色 + 吉凶语义色（绿/红/金），深浅色主题下都不跑偏；
 * 不引用任何未经验证的主题 token。
 */
window.__ModuleLoader__.load({
  id: 'dsh-divination-108',
  factory: (require) => {
    const React = require('react')

    /** 与宿主 src/index.js 的路由路径必须一致。 */
    const ROUTE = '/api/dsh-divination-108/data'
    /** 普通端点（latest/catalog/history/record）的超时。 */
    const TIMEOUT_MS = 15000
    /**
     * AI 判词的超时：**0 = 不设超时**。
     * 曾经用 15 秒（通用超时），`abort()` 又不带 reason，浏览器就把
     * `signal is aborted without reason` 原样抛给用户；改成 5 分钟仍属「掐断」。
     * 模型跑多久由模型决定，客户端只负责等 —— 用户明确要求不要超时截断。
     */
    const JUDGE_TIMEOUT_MS = 0

    /** 七级吉凶 → 颜色与符号（与宿主 core/kit.js 的 VERDICT_GLYPH 保持一致）。 */
    const VERDICT = {
      大吉: { c: '#1a9e5c', g: '◎' },
      吉: { c: '#38a169', g: '○' },
      小吉: { c: '#68a86a', g: '○' },
      平: { c: '#8a8f98', g: '·' },
      小凶: { c: '#c98a3c', g: '△' },
      凶: { c: '#d9534f', g: '▲' },
      大凶: { c: '#b02a37', g: '×' },
    }
    /** 五行 → 颜色。 */
    const WX_COLOR = { 木: '#3f9e63', 火: '#d9534f', 土: '#b8860b', 金: '#c9a227', 水: '#3b7dd8' }
    const CATS = ['易卦', '三式', '六壬', '命理', '择时', '风水', '签卜', '杂占', '姓名', '相术', '西方']

    /**
     * 发一次请求并解析 JSON；非 2xx 抛错。
     * @param {string} query 查询串（如 `kind=latest`）。
     * @param {object} [init] fetch init。
     * @param {number} [timeoutMs] 超时毫秒。**传 0 或负数 = 不设超时**（AI 判词就用这个：
     *   模型要跑多久由模型决定，客户端不该把它掐断）。
     * @returns {Promise<object>} 负载。
     */
    async function request(query, init, timeoutMs) {
      const ms = Number.isFinite(timeoutMs) ? timeoutMs : TIMEOUT_MS
      const controller = ms > 0 ? new AbortController() : null
      const timer = controller ? setTimeout(() => controller.abort(), ms) : null
      try {
        const opts = controller ? { ...init, signal: controller.signal } : { ...(init ?? {}) }
        const res = await fetch(`${ROUTE}?${query}`, opts)
        const text = await res.text()
        let payload = {}
        try { payload = text.length > 0 ? JSON.parse(text) : {} } catch { payload = {} }
        if (res.ok !== true) {
          const e = new Error(payload.error !== undefined ? String(payload.error) : `HTTP ${res.status}`)
          // 把负载挂在错误上：面板据此识别 `code`（如 stale-session 要自动开新对话）
          e.payload = payload
          e.status = res.status
          throw e
        }
        return payload
      } catch (err) {
        // `abort()` 不带 reason 时浏览器抛的是 "signal is aborted without reason" ——
        // 对用户毫无信息量，这里换成能看懂的话。
        if (controller !== null && controller.signal.aborted === true) {
          throw new Error(`请求超时（已等待 ${Math.round(ms / 1000)} 秒）`)
        }
        throw err
      } finally {
        if (timer !== null) clearTimeout(timer)
      }
    }

    /**
     * 取「用户当前位置」的经度（真太阳时校正用）。
     *
     * 用户要求「经纬度按用户当前位置算」，故起卦前向浏览器要一次定位。
     * **取不到/被拒就如实降级**：返回带原因的 `from`（会被宿主原样写进合盘与判词简报），
     * **绝不臆造经度**。只做采集与传参，不参与其它交互。
     * @returns {Promise<{longitude:number|undefined, from:string}>} 经度与来源说明。
     */
    async function currentLongitude() {
      try {
        if (typeof navigator === 'undefined' || typeof navigator.geolocation?.getCurrentPosition !== 'function') {
          return { longitude: undefined, from: '未取到位置（当前环境不支持浏览器定位），未做真太阳时校正' }
        }
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 8000, maximumAge: 600000, enableHighAccuracy: false,
          })
        })
        const lng = Number(pos?.coords?.longitude)
        if (!Number.isFinite(lng)) {
          return { longitude: undefined, from: '未取到位置（定位未返回经度），未做真太阳时校正' }
        }
        const acc = Number(pos?.coords?.accuracy)
        return {
          longitude: lng,
          from: `用户当前位置（浏览器定位${Number.isFinite(acc) ? `，精度约 ${Math.round(acc)} 米` : ''}）`,
        }
      } catch (err) {
        // GeolocationPositionError.code: 1=拒绝授权 2=不可用 3=超时
        const why = err?.code === 1 ? '用户拒绝授权' : err?.code === 3 ? '定位超时' : err?.code === 2 ? '定位不可用' : (err?.message ?? '定位失败')
        return { longitude: undefined, from: `未取到位置（${why}），未做真太阳时校正` }
      }
    }



    /** 分值带符号。 */
    const signed = (n) => (n === null || n === undefined ? '—' : (n > 0 ? `+${Math.round(n)}` : String(Math.round(n))))

    /**
     * 折叠块（懒人化的核心构件）——**普通函数，不是组件**。
     *
     * 为什么不做成组件：一是它无状态、纯拼元素，做组件只多一层包装；
     * 二是本仓客户端测试用极简 React 替身，**不调用函数组件**（只走 createElement），
     * 做成组件会让折叠内容在测试树里"不存在"，既有结构断言与压力测试就覆盖不到明细表了。
     *
     * **内容始终在树里**（`display:none` 折叠，而不是不渲染）：切来切去不丢状态，
     * 且压力测试仍然真的渲染 108 行。`data-fold` 供测试断言"默认确实折叠了"。
     * @param {string} name 折叠块标识（写进 data-fold）。
     * @param {string} title 标题。
     * @param {boolean} open 是否展开。
     * @param {Function} onToggle 切换回调。
     * @param {string|undefined} hint 标题右侧提示。
     * @param {...any} children 内容。
     * @returns {object} 元素。
     */
    function fold(name, title, open, onToggle, hint, ...children) {
      return React.createElement('div', { style: { marginTop: 8 } },
        React.createElement('button', {
          type: 'button',
          onClick: onToggle,
          title: open ? '收起' : '展开',
          style: {
            font: 'inherit', fontSize: 11, cursor: 'pointer', width: '100%', textAlign: 'left',
            background: 'transparent', color: 'inherit', border: 'none', padding: 0, opacity: 0.7,
          },
        }, `${open ? '▾' : '▸'} ${title}${hint ? `　${hint}` : ''}`),
        React.createElement('div', {
          'data-fold': name,
          style: { display: open ? 'block' : 'none', padding: '6px 0 2px' },
        }, ...children))
    }

    /**
     * 复制到剪贴板（能力缺失时**如实降级**，不假装成功）。
     * @param {string} text 文本。
     * @returns {Promise<boolean>} 是否复制成功。
     */
    async function copyText(text) {
      const t = String(text ?? '')
      if (t === '') return false
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(t)
          return true
        }
      } catch { /* 下面兜底 */ }
      try {
        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
          const ta = document.createElement('textarea')
          ta.value = t
          document.body.appendChild(ta)
          ta.select()
          const ok = document.execCommand?.('copy') === true
          document.body.removeChild(ta)
          return ok
        }
      } catch { /* 不可用 */ }
      return false
    }

    /** 取第一句人话（白话结论）：按句号/换行切，去掉 Markdown 强调标记与「一句话收束：」前缀。 */
    function firstSentence(text) {
      const t = String(text ?? '')
        .replace(/^\s*一句话收束[：:]\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/^#+\s*/gm, '')
        .trim()
      if (t === '') return ''
      const m = /^([\s\S]*?[。！？!?])(?:\s|$)/.exec(t)
      const s = (m ? m[1] : t.split('\n')[0]).trim()
      return s.length > 120 ? `${s.slice(0, 118)}…` : s
    }

    /**
     * 结果卡：对话流里挂在每条用户消息下面的那张（懒人化三件套 —— 大字总断 + 三行要点 + 提示条）。
     *
     * 与下方「当前一盘」的详情区（108 行明细 / 折叠块）分开：详情区只显示**最新**一盘，
     * 结果卡则**一条用户消息一张**，所以历史不会被后来的盘冲掉。
     * @param {object} rec 求占记录（`record`）。
     * @returns {object} 元素。
     */
    function resultCard(rec) {
      const bb = rec?.board ?? {}
      const ov = bb.overall ?? { verdict: '平', score: 0, consistency: 0, confidence: 0 }
      const keyRows = [
        ['五行', bb.wuxing
          ? `${bb.dominant && bb.dominant !== '—' ? `${bb.dominant}旺` : ''}${bb.lacking && bb.lacking !== '—' ? ` ${bb.lacking}缺` : ''}`.trim() || '（未统计）'
          : '（未统计）'],
        ['跨门共识', (bb.consensusKeys ?? []).slice(0, 3)
          .map((k) => `${k.key} ${k.count}法${Number.isFinite(k.cats) ? `/${k.cats}门` : ''}`).join('　') || '（无）'],
        ['应期倾向', (bb.timing ?? []).slice(0, 3).map((t) => `${t.text}（${t.count}法）`).join('　') || '（合盘未给应期）'],
      ]
      const hints = [
        `⚠ 近似 ${bb.meta?.fidelityTally?.approx ?? 0} 法`,
        `未起 ${bb.meta?.skipped ?? 0} 法`,
        rec?.position?.corrected ? '位置：已按当前位置校正' : '位置：未取到 → 未做真太阳时校正',
        rec?.mode === 'seed' ? 'seed 复现模式' : '随机模式（重问可能不同）',
      ]
      return React.createElement('div', {
        style: {
          padding: '9px 11px', borderRadius: 9, marginTop: 4,
          background: 'rgba(128,128,128,.12)', border: '1px solid rgba(128,128,128,.25)',
        },
      },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        React.createElement(Badge, { verdict: ov.verdict, score: ov.score, size: 17 }),
        React.createElement('span', { style: { fontSize: 15, fontWeight: 800 } }, `合盘总断【${ov.verdict}】${signed(ov.score)}`),
        React.createElement('span', { style: { fontSize: 10, opacity: 0.6 } }, `一致性 ${ov.consistency}　置信 ${ov.confidence}`)),
      React.createElement('div', { style: { marginTop: 5, fontSize: 11.5, lineHeight: '17px' } },
        ...keyRows.map(([k, v]) => React.createElement('div', { key: k, style: { display: 'flex', gap: 8 } },
          React.createElement('span', { style: { opacity: 0.55, minWidth: 56, flex: '0 0 auto' } }, k),
          React.createElement('span', { style: { wordBreak: 'break-word' } }, v)))),
      React.createElement('div', { style: { marginTop: 5, fontSize: 10, opacity: 0.6 } }, hints.join('　·　')),
      bb.advice ? React.createElement('div', { style: { marginTop: 5, fontSize: 11, opacity: 0.8 } }, firstSentence(bb.advice)) : null)
    }

    /** 小徽标。 */    function Badge({ verdict, score, size }) {
      const v = VERDICT[verdict] ?? VERDICT.平
      const s = size ?? 12
      return React.createElement('span', {
        style: {
          display: 'inline-flex', alignItems: 'baseline', gap: 4,
          color: v.c, fontSize: s, fontWeight: 600, whiteSpace: 'nowrap',
        },
      }, `${v.g} ${verdict ?? '—'}`, React.createElement('span', {
        style: { fontSize: s - 1, opacity: 0.75, fontWeight: 500 },
      }, signed(score)))
    }

    /** 五行占比条。 */
    function WuxingBar({ wuxing, dominant, lacking }) {
      if (!wuxing) return null
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        React.createElement('div', { style: { display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' } },
          ['木', '火', '土', '金', '水'].map((w) => React.createElement('div', {
            key: w,
            title: `${w} ${wuxing[w]}%`,
            style: { width: `${Math.max(1, wuxing[w])}%`, background: WX_COLOR[w], opacity: 0.85 },
          }))),
        React.createElement('div', { style: { fontSize: 11, opacity: 0.7 } },
          ['木', '火', '土', '金', '水'].map((w) => `${w}${wuxing[w]}%`).join(' ')
          + (dominant ? `　→　${dominant}旺 ${lacking}缺` : '')),
      )
    }

    /** 一行小节标题。 */
    function SectionTitle({ children }) {
      return React.createElement('div', {
        style: { fontSize: 11, fontWeight: 700, letterSpacing: 0.5, opacity: 0.55, marginTop: 10, marginBottom: 4 },
      }, children)
    }

    /**
     * 错误边界：面板渲染里出的任何异常都**不该让悬浮窗整个消失** ——
     * 那是最糟的失败形态（用户只看到「面板没了」，一点线索都没有）。
     * 兜住并把错误原文显示在面板里，方便定位。
     */
    const PanelErrorBoundary = typeof React.Component === 'function'
      ? class PanelErrorBoundary extends React.Component {
        constructor(props) { super(props); this.state = { err: null } }
        static getDerivedStateFromError(err) { return { err } }
        componentDidCatch(err) {
          try { console.error("[dsh-divination-108] 面板渲染异常", err) } catch { /* 记不上就算 */ }
        }
        render() {
          if (this.state.err) {
            return React.createElement("div", {
              style: {
                position: 'fixed', right: 18, bottom: 18, zIndex: 2147483000, width: 360,
                padding: '10px 12px', borderRadius: 10, fontSize: 11, lineHeight: '16px',
                background: 'rgba(22,24,29,.96)', color: '#e8e6df',
                border: '1px solid rgba(217,83,79,.6)', boxShadow: '0 12px 40px rgba(0,0,0,.45)',
              },
            },
            React.createElement('div', { style: { fontWeight: 700, marginBottom: 4 } }, '☯ 108 术数合盘 · 面板出错'),
            React.createElement('div', { style: { opacity: 0.75, wordBreak: 'break-word' } },
              String(this.state.err && this.state.err.message ? this.state.err.message : this.state.err)))
          }
          return this.props.children
        }
      }
      : null

    /** 注册用外壳：给面板套上错误边界。 */
    function DivinationPanelShell(props) {
      const panel = React.createElement(DivinationPanel, props)
      return PanelErrorBoundary === null
        ? panel
        : React.createElement(PanelErrorBoundary, null, panel)
    }

    /**
     * 面板主体。
     * @returns {object} React 元素。
     */
    function DivinationPanel() {
      const [open, setOpen] = React.useState(false)
      const [state, setState] = React.useState({ status: 'idle', payload: null, message: '' })
      const [expanded, setExpanded] = React.useState(null)
      const [detailCache, setDetailCache] = React.useState({})
      const lastId = React.useRef(0)
      /** 当前这一轮的 sid（点「停止」时要拿它去取消）。 */
      const sidRef = React.useRef('')
      /** 点了「停止」：轮询循环据此退出。 */
      const stopRef = React.useRef(false)
      const lastPollErr = React.useRef('')
      const [fresh, setFresh] = React.useState(false)
      // 面板内直接起卦：所问之事、提交中标记、错误提示。
      const [question, setQuestion] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState('')
      // AI 判词：模型 / 思考强度 / 联网 三个选择 + 结果与状态
      const [providers, setProviders] = React.useState([])
      const [provider, setProvider] = React.useState('')
      const [models, setModels] = React.useState([])
      const [model, setModel] = React.useState('')
      const [efforts, setEfforts] = React.useState([])
      const [effort, setEffort] = React.useState('')
      const [useWeb, setUseWeb] = React.useState(false)
      const [judgement, setJudgement] = React.useState('')
      const [judging, setJudging] = React.useState(false)
      const [judgeNote, setJudgeNote] = React.useState('')
      // 三步流水线：stage 是「当前在哪一步」，phase 是给人看的进度文案。
      // stage: '' 空闲 | 'running' agent 正在跑（起卦/联网/写判词）| 'casting' 本地直接起卦

      const [stage, setStage] = React.useState('')
      // 跑起来之后的秒表：让用户在等待时看得出「还活着」而不是卡死。
      const [elapsed, setElapsed] = React.useState(0)
      /** 宿主报的当前阶段（模型思考中 / 检索中 / 执行工具中…）：让「卡在哪」看得见。 */
      const [hostPhase, setHostPhase] = React.useState('')
      /** 跑完之后默认**收起**执行过程（占地方），想看再点开。 */
      const [showSteps, setShowSteps] = React.useState(false)
      const [phase, setPhase] = React.useState('')
      /** 联网自检结果（勾上「联网」时自动测）。 */
      const [webCheck, setWebCheck] = React.useState({ status: '', count: 0, error: '', sample: '' })
      // `chat` 是执行过程流水（起卦 / 🔍检索 / 📄读取 / 📋判词），摊在面板上。
      const [chat, setChat] = React.useState([])
      // ── 懒人化（task-21，用户授权重构）──────────────────────────────
      // 默认只看到「输入框 + 最终结果」。配置与细节都折叠，不占屏、不挡路。
      const [advancedOpen, setAdvancedOpen] = React.useState(false)   // 高级：provider/model/强度/联网
      const [folds, setFolds] = React.useState({})                    // 结论区各折叠块
      const [hintOpen, setHintOpen] = React.useState(false)           // 提示条展开（近似/未起逐条）
      // ── 一问一答（task-23，用户要求「可以一问一答，方便占卜模型补充消息」）──
      // `messages` 是对话流（用户消息 / 结果卡 / 模型回复），**累积**而不是覆盖；
      // `sessionId` 是宿主侧会话 id：首轮新建、后续轮带上 → 模型才能看到上一句、才能追问。
      const [messages, setMessages] = React.useState([])
      const [sessionId, setSessionId] = React.useState('')

      /** 拉 provider 列表（只在首次展开时）。 */
      const loadProviders = React.useCallback(async () => {
        try {
          const p = await request('kind=models', undefined, 60000)
          const list = p?.providers ?? []
          setProviders(list)
          if (list.length > 0 && provider === '') setProvider(list[0].id)
        } catch { /* 宿主没提供 llm 时不阻塞起卦 */ }
      }, [provider])

      /** 秒表：stage 进 running 就每秒 +1，收尾时归零。 */
      React.useEffect(() => {
        if (stage !== 'running') { setElapsed(0); return undefined }
        const t = setInterval(() => { setElapsed((x) => x + 1) }, 1000)
        return () => { clearInterval(t) }
      }, [stage])

      /** 首次展开面板时拉 provider 列表（没这一步下拉就永远是「无可用模型」）。 */
      React.useEffect(() => {
        if (!open) return
        loadProviders()
      }, [open, loadProviders])

      /** provider 变了 → 拉它的模型。 */

      /** provider 变了 → 拉它的模型。 */
      React.useEffect(() => {
        if (!open || provider === '') return undefined
        let alive = true
        ;(async () => {
          try {
            const p = await request(`kind=models&provider=${encodeURIComponent(provider)}`, undefined, 60000)
            if (!alive) return
            const list = p?.models ?? []
            setModels(list)
            setModel(list.length > 0 ? list[0].id : '')
          } catch { if (alive) { setModels([]); setModel('') } }
        })()
        return () => { alive = false }
      }, [open, provider])

      /** provider+model 变了 → 拉思考强度档位。 */
      React.useEffect(() => {
        if (!open || provider === '' || model === '') return undefined
        let alive = true
        ;(async () => {
          try {
            const p = await request(`kind=efforts&provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`, undefined, 60000)
            if (!alive) return
            const list = p?.efforts ?? []
            setEfforts(list)
            const def = p?.defaultEffort
            setEffort(typeof def === 'string' ? def : (list.length > 0 ? list[0].id : ''))
          } catch { if (alive) { setEfforts([]); setEffort('') } }
        })()
        return () => { alive = false }
      }, [open, provider, model])

      /**
       * 联网自检：一勾上「联网」就去打一次 webprobe，把**可用性与失败原因**直接显示出来。
       *
       * 为什么需要：以前联网失败时插件静默降级，面板什么都不显示，看起来就像
       * 「联网没生效」—— 用户没法判断是没配搜索提供方、还是查询没结果。现在失败原因
       * （如 WEB_PROVIDER_UNAVAILABLE）会原样出现。
       */
      React.useEffect(() => {
        if (!open || !useWeb) { setWebCheck({ status: '', count: 0, error: '', sample: '' }); return undefined }
        let alive = true
        setWebCheck({ status: 'checking', count: 0, error: '', sample: '' })
        ;(async () => {
          try {
            const p = await request('kind=webprobe', undefined, 60000)
            if (!alive) return
            const s = p?.sample
            setWebCheck({
              status: 'ok',
              count: Number(p?.count ?? 0),
              error: '',
              sample: s && s.url ? `${s.title || '(无标题)'}｜${s.url}` : '',
            })
          } catch (err) {
            if (alive) setWebCheck({ status: 'fail', count: 0, error: err?.message ?? String(err), sample: '' })
          }
        })()
        return () => { alive = false }
      }, [open, useWeb])

      /**
       * 让 AI 把合盘读成「综合判词」。
       * 模型与思考强度由上面三个选择决定；`useWeb` 打开时宿主先联网查资料再交给模型。
       */
      const runJudge = React.useCallback(async (recordId) => {
        const id = recordId ?? state.payload?.record?.id
        if (!Number.isFinite(Number(id)) || provider === '' || model === '') {
          setJudgeNote(provider === '' || model === '' ? '请先选模型' : '还没有求占记录')
          return
        }
        setJudging(true)
        setJudgeNote('')
        try {
          const payload = await request('kind=interpret', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: Number(id), provider, model, effort, web: useWeb }),
          }, JUDGE_TIMEOUT_MS)
          if (payload?.ok && typeof payload.text === 'string') {
            setJudgement(payload.text)
            const n = (payload.sources ?? []).length
            setJudgeNote(useWeb ? (n > 0 ? `已联网参考 ${n} 条资料` : (payload.webNote || '联网未取到资料')) : '')
          } else {
            setJudgeNote(payload?.error ?? 'AI 判词失败')
          }
        } catch (err) {
          setJudgeNote(err?.message ?? String(err))
        } finally {
          setJudging(false)
        }
      }, [state.payload, provider, model, effort, useWeb])

/** 机器当前时间（客户端自己也算一份，免得服务端没回 machineTime 时显示 undefined）。 */
      const machineNow = () => {
        const d = new Date()
        const p = (n) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
      }

      /**
       * 往对话流里追加一条消息（**追加**，不覆盖）。
       * @param {object} m 消息：`{role:'user'|'result'|'assistant', text?, record?, error?}`。
       * @returns {number} 追加后的条数。
       */
      const pushMessage = React.useCallback((m) => {
        setMessages((prev) => [...prev, { seq: prev.length + 1, ...m }])
        return 0
      }, [])

      /** 开新对话：清空对话流与宿主会话 id（下一轮会新建会话，**不带旧 sessionId**）。 */
      const newConversation = React.useCallback(async () => {
        setMessages([])
        setSessionId('')
        sidRef.current = ''
        setJudgement('')
        setChat([])
        setJudgeNote('')
        setNotice('')
      }, [])

      /**
       * 停止当前这一轮：先让宿主 abort，再让轮询退出。
       * 这不是「限制」—— 是用户随时能喊停的出口（原来靠 6 分钟超时，现在不限时）。
       */
      const stopRun = React.useCallback(async () => {
        stopRef.current = true
        const sid = sidRef.current
        if (sid !== '') {
          try { await request(`kind=agentcancel&sid=${encodeURIComponent(sid)}`, { method: 'POST' }, 30000) } catch { /* 已结束 */ }
        }
        setNotice('已停止这一轮')
      }, [])
/**
       * ⭐ 起卦：**像在会话里一样**跑一轮 —— 模型自己起卦、自己联网、自己写判词。
       *
       * 循环在宿主侧（本插件的 `kind=agent` 端点）用**真工具调用**完成，工具就是
       * 插件自己的 `divine` / `divine_detail` 加上 `web_search` / `web_fetch`。
       * 一次请求跑完，返回「综合判词」+ 那张合盘记录，面板按现有排版展示。
       *
       * **不碰主会话**：全程走插件自己的端点与 `ctx.llm` / `ctx.web`。
       */
      const startRun = React.useCallback(async () => {
        const q = question.trim()
        if (q === '' || busy) return
        stopRef.current = false
        sidRef.current = ''
        lastPollErr.current = ''
        setNotice('')
        setChat([])
        setJudgeNote('')
        // 对话流：这条用户消息**立刻**进列表（输入框不锁死，随即可发下一条）
        pushMessage({ role: 'user', text: q })
        setQuestion('')
        // 经纬度按用户当前位置算（浏览器定位）；取不到则如实降级，宿主会标注「未做真太阳时校正」
        const geo = await currentLongitude()
        /** 结果卡：本地起卦秒回，懒人化三件套（大字总断 + 三行要点 + 提示条）。 */
        const resultBody = { question: q, format: 'brief', longitude: geo.longitude, longitudeFrom: geo.from }
        // 没选模型：退化成本地直接起卦（不走模型，也就没有判词）
        if (provider === '' || model === '') {
          setBusy(true)
          setStage('casting')
          try {
            const payload = await request('kind=run', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(resultBody),
            }, 60000)
            if (payload?.record) {
              lastId.current = payload.record.id ?? lastId.current
              setState({ status: 'ready', payload, message: '' })
              setExpanded(null)
              setDetailCache({})
              pushMessage({ role: 'result', record: payload.record })
              pushMessage({ role: 'assistant', text: '（未选模型：只起了卦，没有判词。在「高级」里选个模型再发一条，就会有综合判词；也可以继续问我问题。）' })
            } else {
              setNotice(payload?.error ?? '起卦失败')
              pushMessage({ role: 'assistant', text: `起卦失败：${payload?.error ?? '未知原因'}`, error: true })
            }
          } catch (err) {
            setNotice(err?.message ?? String(err))
            pushMessage({ role: 'assistant', text: `起卦失败：${err?.message ?? String(err)}`, error: true })
          } finally {
            setStage('')
            setBusy(false)
          }
          return
        }
        setBusy(true)
        setStage('running')
        // ① 先秒回结果卡（不等模型）——用户最想看的东西不能等
        try {
          const fast = await request('kind=run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(resultBody),
          }, 60000)
          if (fast?.record) {
            lastId.current = fast.record.id ?? lastId.current
            setState({ status: 'ready', payload: { record: fast.record }, message: '' })
            setExpanded(null)
            setDetailCache({})
            pushMessage({ role: 'result', record: fast.record })
          }
        } catch { /* 秒回失败不致命：下面 agent 轮里还会起一次卦 */ }
        /** 收尾：判词 / 合盘 / 提示一次落定（同步返回与轮询到终态走同一段）。 */
        const settle = (res) => {
          setHostPhase('')
          if (res?.error) {
            setNotice(String(res.error))
            pushMessage({ role: 'assistant', text: `（这一轮失败：${res.error}）`, error: true })
            return
          }
          if (Array.isArray(res?.steps)) setChat(res.steps)
          if (res?.record) {
            lastId.current = res.record.id ?? lastId.current
            setState({ status: 'ready', payload: { record: res.record }, message: '' })
            setExpanded(null)
            setDetailCache({})
          }
          if (typeof res?.judgment === 'string' && res.judgment !== '') {
            setJudgement(res.judgment)
            pushMessage({ role: 'assistant', text: res.judgment })
          } else {
            setJudgeNote('模型没有给出判词。')
            pushMessage({ role: 'assistant', text: '（模型这一轮没有给出判词）', error: true })
          }
          const n = (res?.steps ?? []).filter((s) => s.kind === 'search').length
          if (useWeb) setJudgeNote(n > 0 ? `已联网检索 ${n} 轮` : '模型这一轮没联网')
        }
        try {
          // 2) 起一轮（带 sessionId → 续接同一会话，模型能看到上一句）
          const agentBody = {
            question: q, provider, model, effort, web: useWeb,
            longitude: geo.longitude, longitudeFrom: geo.from,
            conversation: true,
          }
          if (sessionId !== '') agentBody.sessionId = sessionId
          let start
          try {
            start = await request('kind=agent', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(agentBody),
            }, 0)
          } catch (err) {
            // 会话过期/不存在：**如实告知**并自动开一段新对话重试一次（绝不静默串到别的会话）
            if (err?.payload?.code === 'stale-session' && sessionId !== '') {
              setSessionId('')
              pushMessage({ role: 'assistant', text: '（上一轮会话已过期，已自动开始新对话；之前说过的话不再带入。）' })
              start = await request('kind=agent', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ...agentBody, sessionId: undefined }),
              }, 0)
            } else throw err
          }
          if (start?.ok !== true) {
            setNotice(start?.error ?? '求占失败')
            return
          }
          const srvSid = typeof start.sessionId === 'string' && start.sessionId !== ''
            ? start.sessionId
            : (typeof start.sid === 'string' ? start.sid : '')
          if (srvSid !== '' && srvSid !== sessionId) setSessionId(srvSid)
          setChat(Array.isArray(start.steps) ? start.steps : [])
          if (typeof start.phase === 'string') setHostPhase(start.phase)
          // 兼容两种宿主：不是 running（旧版整轮已跑完 / 或跑得极快）就直接收尾，别去轮询。
          if (start.state !== 'running' || !start.sid) {
            settle(start)
            return
          }
          // 3) 边跑边取：每 700ms 拉一次进度，步骤**立刻**出现在面板上
          const sid = String(start.sid)
          sidRef.current = sid
          // **不设上限**：跑到模型自己收工为止（想停就点「停止」）。
          for (;;) {
            if (stopRef.current) { setNotice('已停止这一轮'); return }
            await new Promise((r) => { setTimeout(r, 700) })
            let res
            try {
              res = await request(`kind=agentpoll&sid=${encodeURIComponent(sid)}`, undefined, 60000)
            } catch (err) {
              // 轮询失败不致命：接着试（不设超时）
              lastPollErr.current = err?.message ?? String(err)
              continue
            }
            // 旧宿主没有 agentpoll：拿到的东西没有 state，直接当终态收尾
            if (res?.ok !== true || (res.state === undefined && res.steps === undefined)) {
              setNotice(res?.error ?? '宿主没有 agentpoll 端点（请重启 DSH 让宿主半边更新）')
              return
            }
            if (Array.isArray(res.steps)) setChat(res.steps) // ← 逐步更新
            if (typeof res.phase === 'string') setHostPhase(res.phase)
            if (res.state !== 'running') { settle(res); return }
          }
        } catch (err) {
          setNotice(err?.message ?? String(err))
          pushMessage({ role: 'assistant', text: `（这一轮失败：${err?.message ?? String(err)}）`, error: true })
        } finally {
          setStage('')
          setBusy(false)
        }
      }, [question, busy, provider, model, effort, useWeb, sessionId, pushMessage])

      // 面板展示用的记录：来自 kind=latest / kind=agent 的 record / openDetail
      const record = state.payload?.record ?? null
      const board = record?.board ?? null
      const cache = record ? detailCache[record.id] : null
      // 表格单元格的基础样式与等宽样式（曾连同 rows 一起被误删）。
      const cell = { padding: '3px 6px', verticalAlign: 'top' }
      const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }

      // 108 法的展示行：把 record.results 摊平成表格要用的形状。
      //
      // ⚠ 这个变量曾被误删，导致「一渲染合盘就 ReferenceError: rows is not defined」，
      //   面板当场只剩错误卡片 —— 5f 压力测试就是为钉死它写的。
      // 「一句话收束」从判词里拆出来单独置顶（模型按契约把它放在第一行）。
      const takeOneLine = (text) => {
        const t = String(text ?? '')
        const m = /^[ \t]*一句话收束[：:]\s*([\s\S]*?)(?:\n\s*\n|\n(?=[^\s])|$)/m.exec(t)
        if (!m) return { oneLine: '', body: t }
        const oneLine = String(m[1] ?? '').replace(/\s*\n\s*/g, ' ').trim()
        const body = (t.slice(0, m.index) + t.slice(m.index + m[0].length)).replace(/^\s*\n+/, '').trim()
        return { oneLine, body }
      }
      const judgeParts = takeOneLine(judgement)

      const rows = (record?.results ?? []).map((r) => ({
        no: r.no, name: r.name, fidelity: r.fidelity, error: r.error,
        verdict: r.outcome ? r.outcome.verdict : r.verdict,
        score: r.outcome ? r.outcome.score : r.score,
        essence: r.outcome ? r.outcome.essence : r.essence,
      }))
      // 防御性归一：合盘少任何一个字段都不该把面板搞崩（面板整个消失是最糟的失败形态）
      const b = board ?? {}
      const overall = b.overall ?? { verdict: '平', score: 0, consistency: 0, confidence: 0 }
      const polarity = b.polarity ?? { 吉: 0, 平: 0, 凶: 0 }
      const metaB = b.meta ?? { computed: 0, count: 0, skipped: 0 }
      /** 拉一次最新记录（面板打开时 / 点 ↻ 时）。 */
      const load = React.useCallback(async () => {
        try {
          const payload = await request('kind=latest')
          if (payload?.record) {
            lastId.current = payload.record.id ?? lastId.current
            setState({ status: 'ready', payload, message: '' })
          } else if (payload?.record === null) {
            setState({ status: 'idle', payload: null, message: '' })
          }
        } catch (err) {
          setState({ status: 'failed', payload: null, message: err?.message ?? String(err) })
        }
      }, [])

      /** 清空当前页面，重新起卦（同时清服务端内存里的记录，免得又被 latest 拉回来）。 */
      const clearAll = React.useCallback(async () => {
        try { await request('kind=clear', { method: 'POST' }) } catch { /* 清本地视图就够了 */ }
        lastId.current = 0
        setState({ status: 'idle', payload: null, message: '' })
        setJudgement('')
        setJudgeNote('')
        setChat([])
        setNotice('')
        setExpanded(null)
        setDetailCache({})
        setQuestion('')
      }, [])

      /**
       * 点某一行下钻：拉该记录的完整 results（每法的 detail）并缓存。
       * @param {object} row 明细行。
       */
      const openDetail = React.useCallback(async (row) => {
        if (expanded === row.no) { setExpanded(null); return }
        setExpanded(row.no)
        const id = state.payload?.record?.id
        if (!id || detailCache[id]) return
        try {
          const payload = await request(`kind=record&id=${id}`)
          if (payload?.record) setDetailCache((c) => ({ ...c, [id]: payload.record }))
        } catch { /* 下钻失败不影响主视图 */ }
      }, [expanded, state.payload, detailCache])

      const header = React.createElement('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
          flex: '0 0 auto', borderBottom: '1px solid rgba(128,128,128,.18)',
        },
      },
      React.createElement('span', { style: { fontSize: 12.5, fontWeight: 700 } }, '☯ 108 术数合盘'),
      React.createElement('span', { style: { fontSize: 10, opacity: 0.5 } }, '108法'),
      React.createElement('span', { style: { flex: 1 } }),
      React.createElement('button', {
        type: 'button', onClick: clearAll, title: '清空当前页面并清服务端记录，重新起卦',
        style: { font: 'inherit', fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,.35)', borderRadius: 6, padding: '2px 7px', opacity: 0.75 },
      }, '清空'),
      React.createElement('button', {
        type: 'button', onClick: () => { newConversation(); clearAll() }, title: '新对话：清空对话流与会话 id，下一条从新会话开始',
        style: { font: 'inherit', fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,.35)', borderRadius: 6, padding: '2px 7px', opacity: 0.75 },
      }, '新对话'),
      React.createElement('button', {
        type: 'button', onClick: load, title: '刷新',
        style: { font: 'inherit', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'inherit', border: 'none', opacity: 0.7 },
      }, '↻'),
      React.createElement('button', {
        type: 'button', onClick: () => setOpen(false), title: '收起',
        style: { font: 'inherit', fontSize: 14, cursor: 'pointer', background: 'transparent', color: 'inherit', border: 'none', opacity: 0.7 },
      }, '✕'))

      const composer = React.createElement('div', {
        style: {
          display: 'flex', gap: 6, padding: '9px 12px', flex: '0 0 auto',
          borderBottom: '1px solid rgba(128,128,128,.18)', alignItems: 'center',
        },
      },
      React.createElement('textarea', {
        value: question,
        rows: 1,
        placeholder: '所问之事，例：这次合作能不能成（回车发送 · Shift+回车换行）',
        onChange: (e) => setQuestion(e.target.value),
        // Enter 发送、Shift+Enter 换行（一问一答：输入框**常驻**，发完不锁死）
        onKeyDown: (e) => {
          if (e.key === 'Enter' && e.shiftKey !== true) {
            if (typeof e.preventDefault === 'function') e.preventDefault()
            startRun()
          }
          if (e.key === 'Escape') setQuestion('')
        },
        style: {
          flex: 1, minWidth: 0, font: 'inherit', fontSize: 12, padding: '6px 9px',
          borderRadius: 7, color: 'inherit', resize: 'vertical', maxHeight: 96,
          border: '1px solid rgba(128,128,128,.35)', background: 'rgba(255,255,255,.06)',
          outline: 'none', lineHeight: '17px',
        },
      }),
      React.createElement('button', {
        type: 'button',
        onClick: stage === 'running' ? stopRun : startRun,
        disabled: (busy && stage !== 'running') || question.trim() === '',
        title: stage === 'running'
          ? '停止当前这一轮'
          : '像在会话里一样起卦：模型自己调 divine 起卦、自己联网查证、自己写综合判词（全程在面板内，不进主会话）',
        style: {
          font: 'inherit', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          cursor: busy || question.trim() === '' ? 'default' : 'pointer',
          padding: '6px 12px', borderRadius: 7, color: '#fff', border: 'none',
          background: busy || question.trim() === '' ? 'rgba(128,128,128,.35)' : '#8a6d3b',
        },
      }, stage === 'running' ? '停止' : (busy ? '求占中…' : '起卦')))

      // 执行过程流水的图标：☯起卦 / 🔎下钻 / 🔍检索 / 📄读页 / 📝判词
      const chatIcon = { cast: '☯', detail: '🔎', search: '🔍', fetch: '📄', done: '📝' }

      /** 跑完之后折叠成一条细线：想看过程再点开（默认收起，不占地方）。 */
      const stepsToggle = (chat.length > 0 && stage !== 'running')
        ? React.createElement('div', {
          style: { padding: '5px 12px', flex: '0 0 auto', borderBottom: '1px solid rgba(128,128,128,.18)' },
        },
        React.createElement('button', {
          type: 'button', onClick: () => setShowSteps(!showSteps),
          title: showSteps ? '收起执行过程' : '展开执行过程',
          style: {
            font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent',
            color: 'inherit', border: 'none', opacity: 0.55, padding: 0,
          },
        }, `${showSteps ? '▾' : '▸'} 执行过程（${chat.length} 步）`))
        : null

      // ───────── 执行过程流水：模型这一轮做了什么，全摊在面板上 ─────────
      const stepsOpen = stage === 'running' || showSteps
      const chatBlock = ((chat.length > 0 || stage === 'running') && stepsOpen)
        ? React.createElement('div', {
          style: {
            padding: '7px 12px 8px', flex: '0 0 auto', maxHeight: 190, overflowY: 'auto',
            borderBottom: '1px solid rgba(128,128,128,.18)',
            fontSize: 10.5, lineHeight: 1.5,
          },
        },
        React.createElement('div', { style: { opacity: 0.6, marginBottom: 4 } },
          `执行过程（${chat.length} 步${stage === 'running' ? ` · 已等 ${elapsed}s${hostPhase !== '' ? ` · ${hostPhase}` : ''}` : ''}）`),
        ...chat.map((st, k) => React.createElement('div', {
          key: k,
          style: {
            marginBottom: 3, opacity: st.kind === 'done' ? 0.9 : 0.78,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          },
        },
        `${chatIcon[st.kind] ?? '·'} ${st.kind === 'search' || st.kind === 'fetch'
          ? `${st.arg ?? ''}${st.count !== undefined ? `（${st.count} 条）` : ''}`
          : (st.text ?? '')}`)))
        : null

      const selStyle = {
        font: 'inherit', fontSize: 11, padding: '3px 6px', borderRadius: 6,
        color: 'inherit', border: '1px solid rgba(128,128,128,.35)',
        background: 'rgba(255,255,255,.06)', maxWidth: 150, outline: 'none',
      }
      // ── 高级区（默认折叠）：provider / model / 思考强度 / 联网 / 重出判词 ──
      // 懒人化要求：不打开也能用（走配置默认值）。控件仍在树里（见 Fold 的说明）。
      const advancedInner = React.createElement('div', {
        style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '2px 0' },
      },
      React.createElement('select', {
        value: provider, title: 'provider',
        onChange: (e) => setProvider(e.target.value),
        style: selStyle,
      }, providers.length === 0
        ? React.createElement('option', { value: '' }, '（无可用模型）')
        : providers.map((p) => React.createElement('option', { key: p.id, value: p.id }, p.name))),
      React.createElement('select', {
        value: model, title: 'model',
        onChange: (e) => setModel(e.target.value),
        style: selStyle,
      }, models.length === 0
        ? React.createElement('option', { value: '' }, '（先选 provider）')
        : models.map((m) => React.createElement('option', { key: m.id, value: m.id }, m.name))),
      React.createElement('select', {
        value: effort, title: '思考强度',
        onChange: (e) => setEffort(e.target.value),
        style: { ...selStyle, maxWidth: 110 },
      }, efforts.length === 0
        ? React.createElement('option', { value: '' }, '默认强度')
        : efforts.map((x) => React.createElement('option', { key: x.id, value: x.id }, x.name))),
      React.createElement('label', {
        title: '开：宿主先联网检索资料，再交给模型写判词',
        style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', opacity: 0.85 },
      },
      React.createElement('input', {
        type: 'checkbox', checked: useWeb,
        onChange: (e) => setUseWeb(e.target.checked),
      }), '联网'),
      React.createElement('button', {
        type: 'button', onClick: () => runJudge(),
        disabled: judging || !record,
        title: '让模型把合盘读成综合判词（重算一次）',
        style: {
          font: 'inherit', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
          cursor: judging || !record ? 'default' : 'pointer',
          padding: '4px 9px', borderRadius: 6, color: 'inherit',
          border: '1px solid rgba(128,128,128,.4)', background: 'transparent',
          opacity: judging || !record ? 0.5 : 0.95,
        },
      }, judging ? '生成中…' : '重出判词'))

      const controls = React.createElement('div', {
        style: { padding: '2px 12px 8px', flex: '0 0 auto', borderBottom: '1px solid rgba(128,128,128,.18)' },
      },
      fold('advanced',
        '高级',
        advancedOpen,
        () => setAdvancedOpen(!advancedOpen),
        provider === '' ? '（未选模型：只起卦，不写判词）' : `${provider}${model !== '' ? ` / ${model}` : ''}${useWeb ? ' · 联网' : ''}`,
        advancedInner))

      // 起卦失败 / 提示 / 三步进度 / 资料整理说明
      const noticeRow = (notice === '' && judgeNote === '' && phase === '' && webCheck.status === '')
        ? null
        : React.createElement('div', {
          style: { padding: '6px 12px', fontSize: 11, color: '#d9534f', flex: '0 0 auto' },
        },
        notice !== '' ? notice : (judgeNote !== '' ? judgeNote : null),
        phase !== ''
          ? React.createElement('div', { style: { color: 'inherit', opacity: 0.7 } }, `⏳ ${phase}`)
          : null,
        webCheck.status === 'fail'
          ? React.createElement('div', { style: { color: '#d9534f', marginTop: 3 } },
            `联网自检失败：${webCheck.error}`)
          : (webCheck.status === 'ok'
            ? React.createElement('div', { style: { opacity: 0.6, marginTop: 3 } },
              `联网自检：可用（取到 ${webCheck.count} 条）`)
            : null))

      // ═════════ 懒人化结果区（task-21）：结论优先，细节默认收起 ═════════
      // 折叠状态与工具函数
      const isFoldOpen = (n) => folds[n] === true
      const toggleFold = (n) => setFolds((prev) => ({ ...prev, [n]: prev[n] !== true }))

      // ① 大字总断的数据
      const verdictText = `合盘总断【${overall.verdict}】${signed(overall.score)}`
      // ② 一句话白话结论：优先 AI 判词的白话首句；没有判词就退回程序化断语首句
      const plainLine = judging
        ? 'AI 正在读盘…'
        : (judgeParts.oneLine !== '' ? judgeParts.oneLine
          : (firstSentence(b.advice) || firstSentence(judgeParts.body) || '（合盘已出，见下方要点）'))
      // ③ 三行要点（跨门共识**必须带门数** —— 本次重写的核心设计）
      const keyRows = [
        ['五行', b.wuxing
          ? `${b.dominant && b.dominant !== '—' ? `${b.dominant}旺` : ''}${b.lacking && b.lacking !== '—' ? ` ${b.lacking}缺` : ''}`.trim() || '（未统计）'
          : '（未统计）'],
        ['跨门共识', (b.consensusKeys ?? []).slice(0, 3)
          .map((k) => `${k.key} ${k.count}法${Number.isFinite(k.cats) ? `/${k.cats}门` : ''}`).join('　') || '（无）'],
        ['应期倾向', (b.timing ?? []).slice(0, 3)
          .map((t) => `${t.text}（${t.count}法）`).join('　') || '（合盘未给应期）'],
      ]
      // ④ 提示条：近似 / 未起 / 位置 / 模式（一行 · 分隔，可点开看逐条）
      const tally = b.meta?.fidelityTally ?? {}
      const skippedList = b.meta?.skippedList ?? []
      const hintItems = [
        `⚠ 近似 ${tally.approx ?? 0} 法`,
        `未起 ${metaB.skipped ?? 0} 法`,
        record?.position?.corrected
          ? `位置：${String(record?.position?.from ?? '').slice(0, 20)}，已校正`
          : '位置：未取到 → 未做真太阳时校正',
        record?.mode === 'seed' ? 'seed 复现模式（可复现）' : '随机模式（重问可能不同）',
        `seed ${String(record?.seed ?? '').slice(0, 8)}`,
      ]
      // ⑤ 折叠区数据
      const dv = b.divergence ?? {}
      const conflicts = b.conflicts ?? []
      const cats = b.categories ?? Object.fromEntries(Object.entries(b.byCategory ?? {})
        .map(([k, v]) => [k, typeof v === 'object' ? v.score : v]))
      const digest = Array.isArray(b.evidenceDigest) ? b.evidenceDigest : []

      /** 复制按钮：能力缺失时如实提示，不假装成功。 */
      const copyBtn = (label, getText, title) => React.createElement('button', {
        type: 'button',
        title,
        onClick: async () => {
          const ok = await copyText(getText())
          setNotice(ok ? '' : '复制失败：浏览器未授权剪贴板，请手动选中复制')
          if (ok) setJudgeNote('已复制到剪贴板')
        },
        style: {
          font: 'inherit', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
          padding: '4px 9px', borderRadius: 6, color: 'inherit',
          border: '1px solid rgba(128,128,128,.4)', background: 'transparent', opacity: 0.9,
        },
      }, label)

      const verdictBlock = React.createElement('div', {
        style: {
          padding: '10px 12px', borderRadius: 9,
          background: 'rgba(128,128,128,.14)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        },
      },
      React.createElement(Badge, { verdict: overall.verdict, score: overall.score, size: 20 }),
      React.createElement('span', { style: { fontSize: 17, fontWeight: 800, letterSpacing: '.3px' } }, verdictText),
      React.createElement('span', { style: { fontSize: 10.5, opacity: 0.6 } },
        `吉 ${polarity.吉} · 平 ${polarity.平} · 凶 ${polarity.凶}　一致性 ${overall.consistency}　置信 ${overall.confidence}`))

      const oneLineBlock = React.createElement('div', {
        style: {
          padding: '9px 11px', borderRadius: 8, marginTop: 8,
          background: 'rgba(201,138,60,.16)', border: '1px solid rgba(201,138,60,.5)',
          fontSize: 13, fontWeight: 600, lineHeight: '20px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        },
      },
      React.createElement('div', { style: { fontSize: 10, opacity: 0.6, marginBottom: 3, fontWeight: 400 } },
        judging ? 'AI 正在收束…' : (judgeNote !== '' ? judgeNote : '一句话收束')),
      plainLine)

      const keyBlock = React.createElement('div', { style: { marginTop: 8, fontSize: 12 } },
        ...keyRows.map(([k, v], i) => React.createElement('div', {
          key: k, style: { display: 'flex', gap: 8, marginTop: i === 0 ? 0 : 4, alignItems: 'baseline' },
        },
        React.createElement('span', { style: { fontSize: 10.5, opacity: 0.55, minWidth: 56, flex: '0 0 auto' } }, k),
        React.createElement('span', { style: { flex: '1 1 auto', wordBreak: 'break-word' } }, v))))

      const hintBar = React.createElement('div', {
        style: {
          marginTop: 8, padding: '6px 9px', borderRadius: 7, fontSize: 10.5, lineHeight: '17px',
          background: 'rgba(128,128,128,.10)', opacity: 0.9,
        },
      },
      React.createElement('span', { style: { wordBreak: 'break-word' } }, hintItems.join('　·　')),
      React.createElement('button', {
        type: 'button', onClick: () => setHintOpen(!hintOpen),
        title: hintOpen ? '收起' : '展开：近似项说明与未起逐条',
        style: { font: 'inherit', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'inherit', border: 'none', opacity: 0.7, padding: '0 0 0 6px' },
      }, hintOpen ? '收起' : '详情'),
      React.createElement('div', { 'data-fold': 'hints', style: { display: hintOpen ? 'block' : 'none', marginTop: 5, paddingTop: 5, borderTop: '1px solid rgba(128,128,128,.18)' } },
        React.createElement('div', null, `⚠ = 近似实现（缺秘传表/辞书），**不代表实测结论**；共 ${tally.approx ?? 0} 法。`),
        React.createElement('div', { style: { marginTop: 3 } },
          `未起 ${metaB.skipped ?? 0} 法${skippedList.length > 0 ? `：${skippedList.map((s) => `#${s.no}${s.name}（${s.reason}）`).join('、')}` : '（无）'}`),
        React.createElement('div', { style: { marginTop: 3 } }, `位置：${record?.position?.note ?? record?.solarNote ?? '未提供经度 → 未做真太阳时校正'}`),
        React.createElement('div', { style: { marginTop: 3 } }, `随机性：${record?.modeNote ?? (record?.mode === 'seed' ? 'seed 复现模式' : '随机模式')}`)))

      // 两个按钮：再占一次（**不提示"结果应相同"** —— 默认随机，重问本就可能不同）+ 复制
      const actionRow = React.createElement('div', {
        style: { marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' },
      },
      React.createElement('button', {
        type: 'button',
        onClick: () => startRun(),
        disabled: busy || question.trim() === '',
        title: '用同一问题再占一次（默认随机模式：重问本就可能是新结果）',
        style: {
          font: 'inherit', fontSize: 11, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
          padding: '4px 10px', borderRadius: 6, color: '#fff', border: 'none',
          background: busy ? 'rgba(128,128,128,.35)' : '#8a6d3b',
        },
      }, '再占一次'),
      copyBtn('复制结论', () => [verdictText, plainLine, ...keyRows.map(([k, v]) => `${k}：${v}`)].join('\n'), '复制总断 + 白话结论 + 三行要点'),
      copyBtn('复制 seed', () => String(record?.seed ?? ''), '复制 seed（复核/留档用：带上它即可复现本次结果）'))

      // 折叠区：108 行明细 / 分歧（D1–D5）/ 分类加权 / 出处账本 / 完整判词
      const detailFold = fold('detail', `108 法明细（起 ${metaB.computed}/${metaB.count}）`,
        isFoldOpen('detail'), () => toggleFold('detail'), undefined,
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
        React.createElement('tbody', null, rows.map((r) => {
          const isOpen = expanded === r.no
          return React.createElement(React.Fragment, { key: r.no },
            React.createElement('tr', {
              onClick: () => openDetail(r),
              style: {
                cursor: 'pointer',
                background: isOpen ? 'rgba(128,128,128,.18)' : 'transparent',
                borderBottom: '1px solid rgba(128,128,128,.12)',
              },
            },
            React.createElement('td', { style: { ...cell, ...mono, opacity: 0.5, width: 26 } }, String(r.no).padStart(3, '0')),
            React.createElement('td', { style: { ...cell, whiteSpace: 'nowrap', width: 88 } },
              r.name, r.fidelity === 'approx' ? React.createElement('span', { style: { opacity: 0.5 } }, '⚠') : null),
            React.createElement('td', { style: { ...cell, width: 74 } },
              r.error ? React.createElement('span', { style: { opacity: 0.45 } }, '未起')
                : React.createElement(Badge, { verdict: r.verdict, score: r.score, size: 11 })),
            React.createElement('td', { style: { ...cell, opacity: 0.8, lineHeight: '15px' } },
              r.essence ?? React.createElement('span', { style: { opacity: 0.5 } }, r.error ?? ''))),
            isOpen ? React.createElement('tr', null,
              React.createElement('td', { colSpan: 4, style: { padding: '6px 8px 10px', background: 'rgba(128,128,128,.08)', fontSize: 11, lineHeight: '17px' } },
                detail
                  ? React.createElement('div', null,
                    React.createElement('div', { style: { fontWeight: 600 } }, `#${detail.no} ${detail.name}　${detail.cat}　${detail.fidelity}`),
                    React.createElement('div', { style: { opacity: 0.75, margin: '3px 0' } }, detail.note),
                    Object.entries(detail.outcome?.detail ?? {}).map(([k, v]) =>
                      React.createElement('div', { key: k, style: { marginTop: 3 } },
                        React.createElement('span', { style: { opacity: 0.55 } }, `${k}：`),
                        Array.isArray(v) ? v.join('　') : String(v))))
                  : React.createElement('span', { style: { opacity: 0.6 } }, '载入中…')))
              : null,
          )
        }))))

      const divergenceFold = fold('divergence', '分歧（含 D1–D5 等级）',
        isFoldOpen('divergence'), () => toggleFold('divergence'),
        dv.grade ? `总级 ${dv.grade}` : (conflicts.length > 0 ? `${conflicts.length} 项` : '无'),
      (conflicts.length === 0 && !(dv.items?.length > 0))
        ? React.createElement('div', { style: { opacity: 0.6 } }, '诸法无显著分歧。')
        : React.createElement('div', { style: { fontSize: 11, lineHeight: '17px' } },
          React.createElement('div', { style: { opacity: 0.7 } },
            'D1 口径（不同流派，并列不裁决）／D2 尺度（时间量纲不同）／D3 取用（用神取象不同）／D4 资料不足（未起或近似，不是意见不同）／D5 真分歧（同口径同尺度同取用仍相左）'),
          ...(dv.items ?? []).map((d, i) => React.createElement('div', { key: `g${i}`, style: { marginTop: 4 } },
            `【${d.grade}】${d.code}：${d.reason}`)),
          ...conflicts.slice(0, 6).map((c, i) => React.createElement('div', { key: `c${i}`, style: { marginTop: 4 } },
            `${c.cat}【${c.grade ?? '—'}】${c.high.name}${signed(c.high.score)} ↔ ${c.low.name}${signed(c.low.score)}`
            + (c.gap !== undefined ? `（差 ${c.gap} 分）` : '')
            + (c.reason ? `　${String(c.reason).slice(0, 60)}` : '')))))

      const categoryFold = fold('categories', '分类加权',
        isFoldOpen('categories'), () => toggleFold('categories'), `${Object.keys(cats).length} 类`,
      React.createElement('div', { style: { fontSize: 11, lineHeight: '17px', wordBreak: 'break-word' } },
        Object.entries(cats).map(([k, v]) => `${k}${v >= 0 ? '+' : ''}${v}`).join('　') || '（无）'))

      const evidenceFold = fold('evidence', '出处账本',
        isFoldOpen('evidence'), () => toggleFold('evidence'), digest.length > 0 ? `${digest.length} 条` : '空',
      React.createElement('div', { style: { fontSize: 11, lineHeight: '17px', wordBreak: 'break-word' } },
        digest.length === 0
          ? React.createElement('span', { style: { opacity: 0.6 } }, '（本次无出处统计）')
          : React.createElement(React.Fragment, null,
            ...digest.slice(0, 30).map((e, i) => React.createElement('div', { key: i }, `${e.count}× ${e.source}`)),
            record.board?.evidenceDigest?.badCite
              ? React.createElement('div', { style: { marginTop: 3, opacity: 0.7 } }, `另有 ${record.board.evidenceDigest.badCite} 条 cite 非合法字符串（未计入）`)
              : null)))

      const judgeBlock = fold('judge', '完整 AI 判词',
        isFoldOpen('judge'), () => toggleFold('judge'),
        judgeParts.body !== '' ? '已生成' : (judging ? '生成中…' : '未生成'),
      React.createElement('div', { style: { whiteSpace: 'pre-wrap', fontSize: 11.5, lineHeight: '18px' } },
        judgeParts.body !== '' ? judgeParts.body
          : React.createElement('span', { style: { opacity: 0.6 } }, judging ? 'AI 正在读盘…' : '还没生成判词（在「高级」里选模型后重出，或直接看上面的程序化总断）')))

      const questionLine = React.createElement('div', { style: { marginTop: 12, fontSize: 11, opacity: 0.55, lineHeight: '16px', wordBreak: 'break-word' } },
        `所问：${record?.question || '(未记所问)'}　·　${record?.when}　${(record?.pillars ?? []).join(' ')}　农历${record?.lunar}`
        + (record?.topic && record?.topic !== '综合' ? `　归类「${record.topic}」` : ''))

      // ── 对话流（task-23）：用户消息 / 结果卡 / 模型回复，**按时间累积**（不覆盖）──
      // 一问一答：每条用户消息下面挂一张秒回的结果卡，模型回复（含追问）追加在后。
      const conversationBlock = messages.length === 0 ? null
        : React.createElement('div', { style: { marginBottom: 12 } },
          React.createElement('div', { style: { fontSize: 10, opacity: 0.5, marginBottom: 5 } },
            `对话（${messages.length} 条${sessionId !== '' ? ' · 可接着追问' : ''}）`),
          ...messages.map((m) => React.createElement('div', {
            key: m.seq, style: { marginBottom: 8, 'data-msg': m.role },
          },
          m.role === 'user'
            ? React.createElement('div', {
              style: {
                padding: '6px 10px', borderRadius: 8, background: 'rgba(138,109,59,.22)',
                fontSize: 12, fontWeight: 600, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              },
            }, m.text)
            : m.role === 'result'
              ? resultCard(m.record)
              : React.createElement('div', {
                style: {
                  padding: '7px 10px', borderRadius: 8, background: 'rgba(128,128,128,.10)',
                  fontSize: 11.5, lineHeight: '17px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  color: m.error === true ? '#d9534f' : 'inherit',
                },
              }, m.text))))

      const boardLabel = React.createElement('div', {
        style: { fontSize: 10, opacity: 0.5, marginBottom: 5 },
      }, '当前一盘（最新，可下钻 108 法）')

      let body
      if (state.status === 'failed') {
        body = React.createElement('div', { style: { padding: 16, fontSize: 12, color: '#d9534f' } },
          `读取失败：${state.message}`)
      } else if (!record) {
        body = React.createElement('div', { style: { padding: 16, fontSize: 12, opacity: 0.65, lineHeight: '20px' } },
          '在上面输入所问之事，回车即起卦。',
          React.createElement('br'),
          '一次调用会在本机程序化算完 108 法（易卦/三式/六壬/命理/择时/风水/签卜/杂占/姓名/相术/西方）。',
          React.createElement('br'),
          '求占时刻取**这台机器的当前时间**，不用手填。')
      } else {
        const detail = expanded !== null
          ? (cache?.results?.find((r) => r.no === expanded) ?? null)
          : null
        body = React.createElement('div', { style: { padding: '10px 12px', fontSize: 12, lineHeight: '18px' } },
          // ⓪ 对话流（一问一答，历史累积）→ ① 当前一盘的大字总断 → ② 一句话白话结论 → ③ 三行要点 → ④ 提示条 → 按钮 → ⑤ 折叠区
          conversationBlock,
          record ? boardLabel : null,
          verdictBlock,
          oneLineBlock,
          keyBlock,
          hintBar,
          actionRow,
          detailFold,
          divergenceFold,
          categoryFold,
          evidenceFold,
          judgeBlock,
          questionLine)
      }

      // 折叠态：一颗胶囊（点开才展开面板）
      if (!open) {
        return React.createElement('button', {
          type: 'button',
          onClick: () => setOpen(true),
          title: '108 术数合盘：点开在面板里起卦（像在会话里一样，但不进主会话）',
          style: {
            position: 'fixed', right: 18, bottom: 18, zIndex: 2147483000,
            height: 38, padding: '0 15px 0 12px', borderRadius: 19,
            display: 'flex', alignItems: 'center', gap: 7,
            border: '1px solid rgba(128,128,128,.35)',
            background: 'rgba(22,24,29,.95)', color: '#e8e6df',
            font: 'inherit', fontSize: 12.5, cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0,0,0,.4)',
          },
        },
        React.createElement('span', { style: { fontSize: 15 } }, '☯'),
        React.createElement('span', null, '术数合盘'))
      }

      return React.createElement('div', {
        style: {
          position: 'fixed', right: 18, bottom: 18, zIndex: 2147483000,
          width: 440, maxWidth: 'calc(100vw - 36px)',
          maxHeight: 'min(76vh, 760px)',
          display: 'flex', flexDirection: 'column',
          borderRadius: 12, overflow: 'hidden',
          border: '1px solid rgba(128,128,128,.3)',
          background: 'rgba(22,24,29,.95)', color: '#e8e6df',
          boxShadow: '0 12px 40px rgba(0,0,0,.45)',
          backdropFilter: 'blur(10px)',
        },
      }, header, composer, chatBlock, stepsToggle, controls, noticeRow, React.createElement('div', { style: { overflowY: 'auto', flex: '1 1 auto' } }, body))
    }

    /** 需要 slots 服务；声明为依赖后 cordis 会等服务就绪再调 apply。 */
    const inject = ['slots']

    /**
     * 把面板挂到全局悬浮层。
     *
     * **只注册这一个槽**：面板自己跑完全程（三步都走插件自己的宿主端点），既不进
     * 主会话、也不需要会话域的 `sessionId`/`inputActions`，所以不再挂会话探针 ——
     * 少一个槽就少一类「cordis 服务守卫」的坑。
     *
     * @param {object} ctx 客户端 cordis 上下文。
     */
    function apply(ctx) {
      const slots = ctx.slots ?? ctx.get('slots')
      if (slots === undefined) return
      ctx.effect(() => slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'dsh-divination-108', order: 62, label: () => '108 术数合盘' },
        DivinationPanelShell,
      )), 'divination-108: floating panel')
    }

    // `__panel` / `__shell` 是给测试用的：真 React 里注册的是外壳（带错误边界），
    // 而假 React 不会展开 createElement(DivinationPanel, …)，所以测试直接渲染内层。
    return { apply, inject, __panel: DivinationPanel, __shell: DivinationPanelShell }
  },
})
