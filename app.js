/* ============================================================
   ICS学習支援システム app.js v3.0
   PowerPoint風ドラッグ矢印描画
   ============================================================ */
(() => {

  // ================================================================
  // SCENARIO & DATA
  // ================================================================
  const SCENARIO = {
    id: "s1-1",
    title: "急性期：医療救護活動の組織構造を可視化せよ",
    phase: "急性期"
  };
  // シナリオ本体（docx）はシステム外の教材だが、実験で使用する版の識別子を
  // コード側に持たせる。シナリオを改訂したらこの定数を更新する運用とする。
  const CONTENT_VERSIONS = { scenario: "s1-1_v3" };
  // [ADDED flow-v2] 修正フェーズ（Phase 11/13）廃止・測定点移設のフロー版識別子。
  // ログ・エクスポートJSONの分析側でどちらのフロー仕様のログか機械的に判別するために使う。
  const FLOW_VERSION = "flow-v2-no-revision-phase";

  // ================================================================
  // FEATURE FLAGS
  // 将来の再有効化や A/B 比較のため、機能の ON/OFF を1箇所で制御する。
  // false にすると、ヘッダーステップ表示・遷移ボタン・関連キーボードショートカット等が
  // すべて非表示／無効化される。コード構造（PHASE 定数、PHASE_VIEW_ID、switchPhase の
  // 分岐先）は保持されるため、true に戻すだけで再有効化できる。
  // ================================================================
  const FEATURES = Object.freeze({
    ENABLE_SEQUENCE_PHASE: false,  // Phase 9（シーケンス図構築）
  });

  // ================================================================
  // PHASE 定数
  // state.phase の値がフェーズ名で分かるようにする。
  // DOM 上の .phase-view の並び順やインデックスには依存しない。
  // ================================================================
  const PHASE = {
    ORIENTATION:        0,   // オリエンテーション
    ACUTE_MAP:          1,   // マップ構築（急性期）
    ACUTE_COMPARE:      2,   // 比較・分析（急性期）
    ACUTE_RECORD:       3,   // 対応検証記録レビュー（急性期）
    RECOVERY_PREP:      4,   // 復旧期準備
    RECOVERY_MAP:       5,   // 復旧期マップ
    TRANSITION_COMPARE: 6,   // [NEW] 急性期・復旧期構造比較
    RECOVERY_COMPARE:   7,   // [CHANGED] 6 → 7
    RECOVERY_RECORD:    8,   // [CHANGED] 7 → 8
    SEQUENCE:           9,   // [CHANGED] 8 → 9
    ACUTE_DIFF:         10,  // [NEW] 差分提示（急性期）
    ACUTE_REVISE:       11,  // [NEW] 理想マップ修正（急性期）
    ACUTE_LAYER_DIFF:   12,  // [NEW] レイヤー差分提示（急性期）
    ACUTE_LAYER_REVISE: 13,  // [NEW] レイヤー修正（急性期）
    ACUTE_EDGE_MAP:     14,  // [NEW] エッジ付与（急性期 1B を分離）
  };

  // ヘッダーステップの表示順（data-phase の数値ではなく配列 index で done/active 判定）
  // PHASE.ACUTE_DIFF/ACUTE_REVISE は数値が大きいが表示上は ACUTE_MAP の直後に来る。
  // [CHANGED flow-v2] ACUTE_LAYER_REVISE(13) / ACUTE_REVISE(11) を除去（修正フェーズ廃止、
  // 修正プロンプト(b) 2-5）。PHASE定数自体は削除しない（過去ログ突合のため）。
  const PHASE_DISPLAY_ORDER = [
    PHASE.ORIENTATION,        // idx 0
    PHASE.ACUTE_MAP,          // idx 1
    PHASE.ACUTE_LAYER_DIFF,   // idx 2  [NEW]
    PHASE.ACUTE_EDGE_MAP,     // idx 3  [NEW]
    PHASE.ACUTE_DIFF,         // idx 4
    PHASE.ACUTE_COMPARE,      // idx 5
    PHASE.ACUTE_RECORD,       // idx 6
    PHASE.RECOVERY_PREP,      // idx 7
    PHASE.RECOVERY_MAP,       // idx 8
    PHASE.TRANSITION_COMPARE, // idx 9
    PHASE.RECOVERY_COMPARE,   // idx 10
    PHASE.RECOVERY_RECORD,    // idx 11
    PHASE.SEQUENCE,           // idx 12
  ];

  // Phase 1 (ACUTE_MAP) 内部サブフェーズ
  // state.acuteSubPhase の取りうる値。PHASE 定数は変更しない。
  const ACUTE_SUB = {
    L1_COMMAND: "L1_COMMAND",  // Command 層フォーカス（1A 第1段）
    L2_SECTION: "L2_SECTION",  // Section 層フォーカス（1A 第2段）
    L3_BRANCH:  "L3_BRANCH",   // Branch/Group 層フォーカス（1A 第3段）
    REVIEW:     "REVIEW",      // 全体確認（1A 第4段）
    EDGE:       "EDGE",        // エッジ付与（1B）
  };

  const STORAGE_KEY            = "ics-learning-system-v1";
  const STORAGE_SCHEMA_VERSION = 1;

  // フェーズ番号 → 対応する .phase-view の HTML id
  // DOM 順ではなく id で直接参照するため、並び替えに強い。
  // [CHANGED] キー（数値）を PHASE 定数に合わせて更新。値（DOM id 文字列）は変更しない。
  const PHASE_VIEW_ID = {
    [PHASE.ORIENTATION]:        "phase-0",
    [PHASE.ACUTE_MAP]:          "phase-1",
    [PHASE.ACUTE_COMPARE]:      "phase-2",
    [PHASE.ACUTE_RECORD]:       "phase-acuteRecord",
    [PHASE.RECOVERY_PREP]:      "phase-5",
    [PHASE.RECOVERY_MAP]:       "phase-6",
    [PHASE.TRANSITION_COMPARE]: "phase-transitionCompare",  // [NEW]
    [PHASE.RECOVERY_COMPARE]:   "phase-recoveryCompare",
    [PHASE.RECOVERY_RECORD]:    "phase-recoveryRecord",
    [PHASE.SEQUENCE]:           "phase-3",
    [PHASE.ACUTE_DIFF]:         "phase-acuteDiff",   // [NEW]
    [PHASE.ACUTE_REVISE]:       "phase-acuteRevise", // [NEW]
    [PHASE.ACUTE_LAYER_DIFF]:   "phase-acuteDiff",   // [NEW] 10 とビュー共有
    [PHASE.ACUTE_LAYER_REVISE]: "phase-acuteRevise", // [NEW] 11 とビュー共有
    [PHASE.ACUTE_EDGE_MAP]:     "phase-1",           // [NEW] 1 とビュー共有
  };

  // === ノード一覧（Excelノート_.xlsx より） ===
  const PALETTE_NODES = [
    { label: "県庁",                      group: "g-command", icon: "🏛" },
    { label: "C県A保健所",               group: "g-command", icon: "🏥" },
    { label: "地域災害医療コーディネーター", group: "g-command", icon: "🩺" },
    { label: "DMAT",                     group: "g-unit",    icon: "🚑" },  // [CHANGED] g-section→g-unit
    { label: "DHEAT",                    group: "g-section", icon: "📋" },
    { label: "DPAT",                     group: "g-unit",    icon: "🧠" },  // [CHANGED] g-section→g-unit
    { label: "DWAT",                     group: "g-unit",    icon: "💧" },  // [CHANGED] g-section→g-unit
    { label: "JMAT",                     group: "g-unit",    icon: "🏥" },  // [CHANGED] g-section→g-unit
    { label: "JRAT",                     group: "g-unit",    icon: "🔧" },  // [CHANGED] g-section→g-unit
    { label: "C県看護協会",              group: "g-unit",    icon: "💉" },  // [CHANGED] g-section→g-unit
    { label: "医師会",                   group: "g-unit",    icon: "👨‍⚕️" },
    { label: "歯科医師会",               group: "g-unit",    icon: "🦷" },
    { label: "AB薬剤師会",               group: "g-unit",    icon: "💊" },
    { label: "C県栄養士会",              group: "g-unit",    icon: "🥗" },
    { label: "地域包括支援センター",      group: "g-unit",    icon: "🤝" },
    { label: "W民間団体",                group: "g-unit",    icon: "🏢" },
    { label: "市町村保健センター",        group: "g-unit",    icon: "🏘" },  // [CHANGED] g-team→g-unit
    { label: "避難所",                   group: "g-team",    icon: "🏘" },
    { label: "医療機関",                 group: "g-team",    icon: "🏥" },
  ];

  // === エッジ種別（3種類のみ） ===
  // label: エッジラベル, stroke: 線色, bidirectional: 双方向フラグ
  const EDGE_TYPES = [
    { label: "指示命令", desc: "命令・指示の方向を設定", stroke: "#ff6b6b", bidirectional: false },
    { label: "情報伝達", desc: "情報の流れる方向を設定", stroke: "#4d8fff", bidirectional: false },
    { label: "連携協力", desc: "双方向・協力関係（固定）", stroke: "#3dcf8a", bidirectional: true  },
  ];

  // label → {stroke, bidirectional} の逆引きマップ
  const EDGE_MAP = Object.fromEntries(
    [...EDGE_TYPES, { label: "支援", stroke: "#c084fc", bidirectional: false }]
      .map(t => [t.label, t])
  );


  // === 復旧期データ ===
  const RECOVERY_PALETTE_NODES = [
    { label: "県庁",                          group: "g-command", icon: "🏛" },
    { label: "C県A保健所",                   group: "g-command", icon: "🏥" },
    { label: "地域災害医療コーディネーター", group: "g-command", icon: "🩺" },
    { label: "DHEAT",                         group: "g-section", icon: "📋" },  // g-section 維持（撤退候補として学習者が判断）
    { label: "DPAT",                          group: "g-unit",    icon: "🧠" },  // [CHANGED] g-section→g-unit
    { label: "DWAT",                          group: "g-unit",    icon: "💧" },  // [CHANGED] g-section→g-unit
    { label: "JMAT",                          group: "g-unit",    icon: "🏥" },  // [CHANGED] g-section→g-unit
    { label: "JRAT",                          group: "g-unit",    icon: "🔧" },  // [CHANGED] g-section→g-unit
    { label: "C県看護協会",                   group: "g-unit",    icon: "💉" },  // [CHANGED] g-section→g-unit
    { label: "DCAT",                         group: "g-unit",    icon: "🤝" },  // [CHANGED] g-section→g-unit
    { label: "医師会",                        group: "g-unit",    icon: "👨‍⚕️" },
    { label: "歯科医師会",                    group: "g-unit",    icon: "🦷" },
    { label: "AB薬剤師会",                    group: "g-unit",    icon: "💊" },
    { label: "C県栄養士会",                   group: "g-unit",    icon: "🥗" },
    { label: "地域包括支援センター",          group: "g-unit",    icon: "🤝" },
    { label: "W民間団体",                     group: "g-unit",    icon: "🏢" },
    { label: "社会福祉士会",                 group: "g-unit",    icon: "👥" },
    { label: "地域支え合いセンター",         group: "g-unit",    icon: "🏘" },
    { label: "介護支援専門員協会",            group: "g-unit",    icon: "🧑‍⚕️" },
    { label: "市町村保健センター",            group: "g-unit",    icon: "🏘" },  // [CHANGED] g-team→g-unit
    // 被支援者ノード（PHASE6_BENEFICIARY_LABELS）は initPhase6Canvas() が全件初期配置するためパレットから除外
  ];

  const RECOVERY_BENEFICIARY_LABELS = new Set(["避難所", "福祉避難所", "在宅避難者", "仮設住宅"]);

  const PHASE6_BENEFICIARY_LABELS = new Set(["避難所", "医療機関", "福祉避難所", "在宅避難者", "仮設住宅"]);

  const NODE_DESCRIPTIONS = {
    "県庁":                          "広域指揮・県全体の災害対応方針を決定する行政機関",
    "C県A保健所":                   "地域の現地指揮拠点・支援チームの受入・調整を担う行政機関",
    "地域災害医療コーディネーター": "医療資源の配分と機関間調整を専門的に支援する",
    "DMAT":                          "災害や新興感染症等のまん延時に，地域において必要な医療提供体制を支援し，傷病者の生命を守るため厚生労働省の認めた専門的な研修・訓練を受けた災害派遣医療チーム",
    "DHEAT":                         "一定規模以上の災害が発生した際に，被災都道府県庁の保健医療福祉調整本部及び保健所が担う指揮・総合調整機能等を支援するため、専門的な研修・訓練を受けた都道府県等の職員により構成される応援派遣チーム",
    "DPAT":                          "被災地域の専門性の高い精神科医療の提供と精神保健活動の支援（入院患者等の避難及び搬送，被災医療機関・災害ストレスへの支援等）を行うために，都道府県によって組織される，災害派遣精神医療チーム",
    "DWAT":                          "主に一般避難所における要配慮者等の二次被害の防止，安定的な日常生活への移行を支えることを目的に，多様な福祉職で構成する災害派遣福祉チーム",
    "JMAT":                          "被災者の生命及び健康を守り，被災地の公衆衛生を回復し，地域医療や地域包括ケアシステムの再生・復興を支援することを目的とする日本医師会災害医療チーム",
    "JRAT":                          "一般社団法人日本災害リハビリテーション支援協会．被災者・要配慮者の生活不活性発病や災害関連死等の予防に関する支援を行う",
    "C県看護協会":                   "都道府県看護協会に登録されている災害支援ナースの派遣・調整を担う職能団体",
    "医師会":                        "地域医療を担う医師の職能団体",
    "歯科医師会":                    "口腔ケア・身元確認等を担う歯科医師の職能団体",
    "AB薬剤師会":                    "薬剤管理・服薬支援を担う薬剤師の職能団体",
    "C県栄養士会":                   "避難所等での栄養管理・食支援を担う職能団体",
    "地域包括支援センター":           "高齢者・要支援者の生活支援ニーズを把握する機関",
    "W民間団体":                     "行政を補完するボランティア・NPO等の民間支援組織",
    "市町村保健センター":             "住民に最も近い保健活動の実施主体となる行政機関",
    "避難所":                        "自宅に居住できなくなった被災者を一時的に受け入れ保護するための場所",
    "医療機関":                      "急性期における傷病者受入・医療救護の実施場所",
    "DCAT":                          "災害発生時に要配慮者を支援するため，介護福祉士等による専門職で構成するチーム",
    "社会福祉士会":                  "社会福祉士の職能団体．日常生活の再建を支援するための相談援助と，諸 関係機関との連携・調整を行う",
    "地域支え合いセンター":           "仮設住宅や在宅等の被災者を巡回訪問し，困りごとやへの相談対応，交流の場づくりなどを支援する地域の拠点",
    "介護支援専門員協会":             "介護支援専門員の職能団体．大規模災害時に被災地へ災害支援ケアマネジャーを派遣し，高齢者の実態把握，避難所での支援活動を行う",
    "福祉避難所":                    "高齢者や障害者など特別な配慮を必要とする要配慮者を受け入れる避難所",
    "在宅避難者":                    "自宅で居住の継続ができる状況で，自宅に留まる被災住民",
    "仮設住宅":                      "災害で住まいを失った人に対し，行政が一時的に提供する無料の住宅",
  };

  const MAP_PHASE_CONFIG = {
    [PHASE.ACUTE_MAP]: {
      key: "acute", paletteNodes: PALETTE_NODES,
      beneficiaries: new Set(["避難所", "医療機関"]),
      domIds: { canvas:"canvas-acute", svg:"svgLayer-acute", palette:"palette-acute",
                wrap:"canvasWrap-acute", stat:"canvasStat-acute", hint:"arrowModeHint-acute" },
      markerSuffix: "-acute",
    },
    [PHASE.RECOVERY_PREP]: {
      key: "p5",
      isReadOnly: true,
      beneficiaries: new Set(["避難所", "医療機関"]),
      domIds: { canvas:"canvas-p5", svg:"svgLayer-p5",
                wrap:"canvasWrap-p5", stat:"canvasStat-p5" },
      markerSuffix: "-p5",
    },
    [PHASE.RECOVERY_MAP]: {
      key: "p6",
      paletteNodes: RECOVERY_PALETTE_NODES,
      beneficiaries: PHASE6_BENEFICIARY_LABELS,
      domIds: { canvas:"canvas-p6", svg:"svgLayer-p6", palette:"palette-p6",
                wrap:"canvasWrap-p6", stat:"canvasStat-p6", hint:"arrowModeHint-p6" },
      markerSuffix: "-p6",
    },
    [PHASE.ACUTE_REVISE]: {           // [NEW] 理想マップ修正フェーズ
      key: "acuteRevised",
      paletteNodes: PALETTE_NODES,
      beneficiaries: new Set(["避難所", "医療機関"]),
      domIds: { canvas:"canvas-revise", svg:"svgLayer-revise", palette:"palette-revise",
                wrap:"canvasWrap-revise", stat:"canvasStat-revise", hint:"arrowModeHint-revise" },
      markerSuffix: "-revise",
    },
    [PHASE.ACUTE_LAYER_REVISE]: {   // [NEW] レイヤー修正。11 と同じ DOM、データは acute 直編集
      key: "acute",
      paletteNodes: PALETTE_NODES,
      beneficiaries: new Set(["避難所", "医療機関"]),
      domIds: { canvas:"canvas-revise", svg:"svgLayer-revise", palette:"palette-revise",
                wrap:"canvasWrap-revise", stat:"canvasStat-revise", hint:"arrowModeHint-revise" },
      markerSuffix: "-revise",
    },
    [PHASE.ACUTE_EDGE_MAP]: {       // [NEW] エッジ付与。1 と同じ DOM・同じデータ
      key: "acute",
      paletteNodes: PALETTE_NODES,
      beneficiaries: new Set(["避難所", "医療機関"]),
      domIds: { canvas:"canvas-acute", svg:"svgLayer-acute", palette:"palette-acute",
                wrap:"canvasWrap-acute", stat:"canvasStat-acute", hint:"arrowModeHint-acute" },
      markerSuffix: "-acute",
    },
    [PHASE.ACUTE_DIFF]: {           // [NEW] エッジbundleループ。acuteRevised を編集
      key: "acuteRevised",
      paletteNodes: [],
      beneficiaries: new Set(["避難所", "医療機関"]),
      domIds: { canvas:"canvas-diff", svg:"svgLayer-diff", palette:"palette-diff",
                wrap:"canvasWrap-diff", stat:"canvasStat-diff", hint:"arrowModeHint-diff" },
      markerSuffix: "-diff",
    },
    [PHASE.ACUTE_LAYER_DIFF]: {     // [NEW] レイヤーbundleループ。acute を直接編集
      key: "acute",
      paletteNodes: [],
      beneficiaries: new Set(["避難所", "医療機関"]),
      domIds: { canvas:"canvas-diff", svg:"svgLayer-diff", palette:"palette-diff",
                wrap:"canvasWrap-diff", stat:"canvasStat-diff", hint:"arrowModeHint-diff" },
      markerSuffix: "-diff",
    },
  };

  // ================================================================
  // ACUTE_RECORD_CONTENT — 対応検証記録フェーズのデータ定義 [ADDED]
  // 抜粋・問の増減・文言修正はここだけで完結する。
  // ================================================================
  const ACUTE_RECORD_CONTENT = {
    title: "対応検証記録（急性期 課題抜粋）",
    excerpts: [
      {
        id: "1",
        text: "県庁保健医療調整本部‐保健所現地保健医療調整本部との連携は、かなり薄かったと言わざるを得なかった。保健所には県庁本部の動きはまったく伝わってこなかった。また、情報網が遮断されたこともあって、保健所の全体的な活動を本庁に伝える手段もなく、本庁から聞かれることもなかった。"
      },
      {
        id: "2",
        text: "県庁における窓口が統一されておらず、県庁の各課から同じような内容の確認が幾度となくあり、保健所が把握していない問題への対応依頼等があり、保健所は混乱することがあった。"
      },
      {
        id: "3",
        text: "発災後、保健所から管内全市町村統括保健師への連絡は特に被害が大きかったA市、B村に偏ることになってしまったが、保健師活動の課題等を把握するために、全市町村ともっと連絡を持つ必要があった。特に、A市、B村ほどではないものの、被害が大きかったK村、M村とはもう少し密に連絡を取るべきであった。"
      },
      {
        id: "4",
        text: "B村に複数の支援チームが入り、避難所や在宅のデータ管理（入力シート）を各々のチームが作成し作業を行った。支援チームの活動が終了した後、保健所がそれらのデータを集約・整理・活用する作業にかなりの時間を要した。既存の入力シートを継続して活用することができなかった。"
      },
      {
        id: "5",
        text: "県庁本部で、県庁と支援団体間だけで決められていた被災地支援活動などがあった。そういった活動の中には、保健所が現場ですでに取り組んでいた活動もあり、二重になってしまうこともあった。"
      },
      {
        id: "6",
        text: "B村では、発災当初地域包括支援センター職員は、一村職員として災害対応のシフトに組み込まれて各避難所に配置され、地域包括センターの活動としての要配慮者への対応を優先できずにいた。さらに村の介護支援専門員も自らが被災しており、また地域の消防団活動や施設管理者としての役割など重複し、介護支援専門員としての活動をするのは難しい状況であった。"
      }
    ],
    questions: [
      {
        id: "q4",
        kind: "singleChoice",
        label: "問3． 問2で指摘したICS原則違反は，対応検証記録の何番と対応するか1つ示せ。",
        optionsSource: "excerpts",
        required: true
      },
      {
        id: "q5",
        kind: "textarea",
        label: "問4．\t問1・問2での指摘を踏まえつつ、あなたの考える組織構造上の問題が対応失敗をどのように引き起こしたか説明せよ。問2で選んだ原則に限らず、他の構造的要因や複数原則の相互作用に言及してもよい。（200字以内）",
        placeholder: "例）保健所が…という構造的問題があったため、…という失敗が生じた。",
        maxLength: 200,
        required: true
      }
    ]
  };

  // ================================================================
  // RECOVERY_COMPARE_CONTENT — 復旧期比較・分析フェーズのデータ定義 [ADDED]
  // ================================================================
  const RECOVERY_COMPARE_CONTENT = {
    questions: [
      {
        id: "q6",
        kind: "textarea",
        label: "問6． 復旧期の理想マップと実際マップを比較し、最も重要と思う構造的差異を1つ挙げて説明せよ。（100字以内）",
        placeholder: "例）理想マップでは…が存在するが、実際マップでは…",
        maxLength: 100,
      },
      {
        id: "q7",
        kind: "textarea",
        label: "問7． 問6で指摘した差異が生じた理由について、ICS原則のうちどの違反かを選択し、急性期との継続性の観点から説明せよ。（200字以内）",
        placeholder: "例）急性期では…であったが、復旧期には…",
        maxLength: 200,
      }
    ]
  };

  // ================================================================
  // RECOVERY_RECORD_CONTENT — 対応検証記録フェーズのデータ定義（復旧期）
  // ================================================================
  const RECOVERY_RECORD_CONTENT = {
    title: "対応検証記録（復旧期）",
    excerpts: [],
    questions: [
      {
        id: "q9",
        kind: "textarea",
        label: "問8．\t問6・問7を参考に、復旧期の組織構造上の問題が対応失敗をどのように引き起こす可能性があるか説明せよ。（200字以内）",
        placeholder: "例）復旧期には…という構造的問題があったため、…という失敗が生じた。",
        maxLength: 200,
        required: true
      }
    ]
  };

  // === レイヤー定義 ===
  // layer は学習者に見せる ICS 指揮階層（UI の中心概念）
  const LAYER_NAMES = ["", "指揮（Command）", "調整・統制（Section）", "実働（Branch/Group）", "支援対象"];

  // group は学習者に見せる ICS 階層ではなく内部メタデータ（将来の採点・バリデーション用）
  // UI / 描画クラスには一切使用しない
  const GROUP_EXPECTED_LAYERS = {
    "g-command": [1, 2], // 県庁・保健所・コーディネーター
    "g-section": [2],    // DHEAT のみ（調整・統制機能）
    "g-unit":    [2, 3], // 実働チーム・専門職団体
    "g-team":    [4],    // 支援対象（beneficiary）
  };

  // ================================================================
  // STATE
  // ================================================================
  const state = {
    phase: 0,
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    highlightNodeId: null,
    // arrow drawing
    arrowFrom: null,   // node id
    drawingArrow: false,
    previewEnd: { x: 0, y: 0 },
    // answers
    answers: { q1: "", q2: "" },
    log: [],            // backward-compat placeholder (no longer written by logOp)
    // operation log (single top-level series)
    sessionId:      null,
    operationLog:   [],
    phaseStartTime: 0,
    // Phase 1 サブフェーズ (ACUTE_SUB の値 or null)
    acuteSubPhase:  null,
    // ツールチップ ON/OFF
    tooltipEnabled: true,
    // 急性期採点結果（Phase 2 遷移時に gradeAcutePhase() が設定）
    acuteScore: null,
    // 修正後採点結果（ACUTE_REVISE 離脱時に gradeRevisedPhase() が設定）
    acuteScoreRevised: null,
    // 急性期レイヤー採点結果（ACUTE_LAYER_DIFF 入場のたびに gradeAcuteLayerPhase() が再設定） [NEW]
    acuteLayerScore: null,
    // レイヤー修正後採点結果（ACUTE_LAYER_REVISE 離脱時に gradeAcuteLayerRevisedPhase() が設定） [NEW]
    acuteLayerScoreRevised: null,
  };

  window.idealMapAcute     = null;
  window.idealMapRecovery  = null;
  window.actualMapAcute    = null;
  window.actualMapRecovery = null;
  const mapLoadStatus = {
    idealAcute:     "idle",
    idealRecovery:  "idle",
    actualAcute:    "idle",
    actualRecovery: "idle",
  };
  // loadIdealMapAcute() の Promise。localStorage 復元フローが規範マップのロード完了を
  // 待つために参照する（restoreFromStorage 内）。
  let idealAcuteLoadPromise = null;
  // loadIdealMapRecovery() の Promise。現段階では restoreFromStorage() の待機処理には
  // 組み込まない（フェーズ15/16の差分提示フェーズはまだ存在しないため）。
  // 用途：後続段階でフェーズ15（レイヤー差分）・フェーズ16（関係差分）を追加する際、
  // リロード復元時に規範マップのロード完了を待つために使用する予定。
  let idealRecoveryLoadPromise = null;
  // phase5Data の構造：
  //   removals: 削除候補ノード（reason フィールドは後方互換のため残すが UI からは入力されない）
  //   policyRationale: 削除候補選定の判断方針（150字以内・全削除に対して1つのみ）
  //     構造変換能力の三角測量データとして機能。マップ操作の意図解釈に使用。
  window.phase5Data       = { removals: [], policyRationale: "" };

  // ── Phase6 状態変数 ────────────────────────────────────────────────────
  // Phase6 の状態は以下の 2 フラグ + phaseData.p6 の 3 点で表現する。
  //
  //   phase6Initialized      : initPhase6Canvas() が完了して phaseData.p6 に
  //                            初期ノードが入っている場合 true。
  //                            false は「未初期化」または「無効化済み（stale）」。
  //
  //   phase6RemovalSignature : 直近の initPhase6Canvas() / importJSON 時点での
  //                            削除候補スナップショット（getRemovalSignature() の値）。
  //                            switchPhase(RECOVERY_MAP) → p6NeedsRebuild() が
  //                            このシグネチャと現在値を比較して再構築の要否を判定する。
  //                            phase6Initialized=false のときは意味を持たない。
  //
  //   phaseData.p6           : Phase6 キャンバスの実データ。
  //                            phase6Initialized=true のときのみ有効な内容を持つ。
  //
  // 状態遷移:
  //   初期 / resetAll / importJSON(v1)  →  未初期化（false / ""）
  //   initPhase6Canvas() 実行後         →  有効（true / 現在のシグネチャ）
  //   toggleRemovalCandidate() 後       →  無効化（false / "" / p6 cleared）
  //   importJSON(v2) 読込後             →  有効（インポートした p6 + 復元シグネチャ）
  let   phase6Initialized      = false;
  let   phase6RemovalSignature = "";

  // ================================================================
  // PHASE DATA STORE
  // ================================================================
  const phaseData = {
    acute:    { nodes:[], edges:[], answers:{q1:"",q2:"",p3q1:"",p3q2:"",p3q2sel:""}, log:[],
                selectedNodeId:null, selectedEdgeId:null },
    // 旧フォーマット (v1-v3) の importJSON 後方互換のためのみ保持。
    // 通常フローでは savePhaseData の対象外で、常に空のまま。
    recovery: { nodes:[], edges:[], answers:{q1:"",q2:""}, log:[],
                selectedNodeId:null, selectedEdgeId:null },
    // answers.q1, q2 は現行フローでは未使用だが、importJSON v3 互換で復元先として保持。
    p6:       { nodes:[], edges:[], answers:{q1:"",q2:""}, log:[],
                selectedNodeId:null, selectedEdgeId:null },
    acuteRecord:       { answers: { q4: "", q5: "" } },
    acuteLayerBaseline: null,  // [NEW] レイヤー配置（1A）完了時点の不変スナップショット（NEVER overwritten）
    acuteBaseline:     null,  // [NEW] phaseData.acute の不変スナップショット（NEVER overwritten）
    acuteRevised:      null,  // [NEW] 修正フェーズ用の作業コピー
    transitionCompare: { answers: { q6: "" } },  // [NEW] 急性期・復旧期構造比較
    recoveryCompare:   { answers: { q6: "", q7: "", q7sel: "" } },  // 内部キーは q6/q7 を保持
    recoveryRecord:    { answers: { q9: "" } },
  };

  function savePhaseData(key) {
    phaseData[key] = {
      nodes: state.nodes, edges: state.edges,
      answers: { ...state.answers },
      selectedNodeId: state.selectedNodeId, selectedEdgeId: state.selectedEdgeId,
    };
    saveToLocalStorage();
  }

  function loadPhaseData(key) {
    const d = phaseData[key];
    state.nodes = d.nodes; state.edges = d.edges;
    state.answers = { ...d.answers };
    state.selectedNodeId = d.selectedNodeId; state.selectedEdgeId = d.selectedEdgeId;
  }

  // ================================================================
  // DOM REFS
  // ================================================================
  const $ = id => document.getElementById(id);
  const phaseSteps = document.querySelectorAll(".phase-step");

  // Feature flag によるヘッダーステップの動的制御
  // data-phase="8"（PHASE.SEQUENCE）のステップと、その直前の「›」を非表示にする。
  if (!FEATURES.ENABLE_SEQUENCE_PHASE) {
    const seqStep = document.querySelector(`.phase-step[data-phase="${PHASE.SEQUENCE}"]`);
    if (seqStep) {
      const prevArrow = seqStep.previousElementSibling;
      if (prevArrow && prevArrow.classList.contains("phase-arrow")) {
        prevArrow.style.display = "none";
      }
      seqStep.style.display = "none";
    }
  }

  // PHASE_VIEW_ID マップを使い、DOM 順に依存せずビューを切り替える
  function activatePhaseView(p) {
    document.querySelectorAll(".phase-view").forEach(el => el.classList.remove("active"));
    const view = $(PHASE_VIEW_ID[p]);
    if (view) {
      // feature flag で隠した要素を再表示する場合の保険
      if (view.dataset.featureFlag && FEATURES[view.dataset.featureFlag]) {
        view.style.display = "";
      }
      view.classList.add("active");
    }
  }

  // ヘッダーステップの active / done クラスを data-phase 属性で更新する
  // DOM 順の index ではなく各ステップが持つ data-phase 値で比較するため、
  // ステップの並び順変更に強い。
  function updatePhaseSteps(p) {
    const curIdx = PHASE_DISPLAY_ORDER.indexOf(p);
    phaseSteps.forEach(s => {
      const sp    = parseInt(s.dataset.phase, 10);
      const spIdx = PHASE_DISPLAY_ORDER.indexOf(sp);
      s.classList.toggle("active", sp === p);
      s.classList.toggle("done",   spIdx >= 0 && spIdx < curIdx);
    });
  }

  let canvasEl           = null;
  let svgEl              = null;
  let paletteEl          = null;
  let canvasWrap         = null;
  let activeCanvasStatEl = null;
  let activeArrowHintEl  = null;
  let activeMarkerSuffix = "-acute";
  let BENEFICIARY_LABELS = new Set(["避難所", "医療機関"]);
  let activePaletteNodes = PALETTE_NODES;
  let activePhaseKey     = null;
  let _clickTimer        = null;  // シングル/ダブルクリック判定用タイマー

  // ================================================================
  // UTILS
  // ================================================================
  const uid   = () => Math.random().toString(36).slice(2, 9);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const esc   = s => String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");

  function generateSessionId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `s-${Date.now()}-${uid()}`;
  }

  function getPhaseName(phase) {
    switch (phase) {
      case PHASE.ORIENTATION:        return "orientation";
      case PHASE.ACUTE_MAP:          return "acute_map";
      case PHASE.ACUTE_COMPARE:      return "acute_compare";
      case PHASE.ACUTE_RECORD:       return "acute_record";
      case PHASE.RECOVERY_PREP:      return "recovery_prep";
      case PHASE.RECOVERY_MAP:       return "recovery_map";
      case PHASE.TRANSITION_COMPARE: return "transition_compare";
      case PHASE.RECOVERY_COMPARE:   return "recovery_compare";
      case PHASE.RECOVERY_RECORD:    return "recovery_record";
      case PHASE.SEQUENCE:           return "sequence";
      case PHASE.ACUTE_DIFF:         return "acute_diff";   // [NEW]
      case PHASE.ACUTE_REVISE:       return "acute_revise"; // [NEW]
      case PHASE.ACUTE_LAYER_DIFF:   return "acute_layer_diff";   // [NEW]
      case PHASE.ACUTE_LAYER_REVISE: return "acute_layer_revise"; // [NEW]
      case PHASE.ACUTE_EDGE_MAP:     return "acute_edge_map";     // [NEW]
      default:                       return "unknown";
    }
  }

  function logOp(type, detail = {}) {
    state.operationLog.push({
      ts: new Date().toISOString(),
      sessionId: state.sessionId,
      phase: state.phase,
      phaseName: getPhaseName(state.phase),
      activePhaseKey,
      type,
      detail
    });
  }

  function _logPhaseTransition(from, to, prevStartTime) {
    logOp("PHASE_EXIT",     { from, fromName: getPhaseName(from), to, toName: getPhaseName(to) });
    logOp("PHASE_DURATION", { phase: from, phaseName: getPhaseName(from), ms: Date.now() - prevStartTime });
    state.phaseStartTime = Date.now();
    logOp("PHASE_ENTER",    { from, fromName: getPhaseName(from), to, toName: getPhaseName(to) });
  }

  function hasUnsavedWork() {
    const hasString = obj => obj && Object.values(obj).some(v => typeof v === "string" && v.length > 0);
    if (phaseData.acute.nodes.length > 0)    return true;
    if (phaseData.acute.edges.length > 0)    return true;
    if (phaseData.p6.nodes.length > 0)       return true;
    if (phaseData.p6.edges.length > 0)       return true;
    if (hasString(phaseData.acute.answers))           return true;
    if (hasString(phaseData.transitionCompare?.answers)) return true;  // [NEW]
    if (hasString(phaseData.recoveryCompare?.answers))   return true;
    if (hasString(phaseData.acuteRecord?.answers))       return true;
    if (hasString(phaseData.recoveryRecord?.answers))    return true;
    if ((window.phase5Data?.removals?.length ?? 0) > 0) return true;
    return false;
  }

  // ================================================================
  // LOCAL STORAGE — 自動保存・復元
  // ================================================================
  function saveToLocalStorage() {
    try {
      const payload = {
        version:        STORAGE_SCHEMA_VERSION,
        savedAt:        new Date().toISOString(),
        currentPhase:   state.phase,
        acuteSubPhase:  state.acuteSubPhase,
        tooltipEnabled: state.tooltipEnabled,
        sessionId:      state.sessionId,
        phaseStartTime: state.phaseStartTime,
        operationLog:   state.operationLog,
        phaseData:      phaseData,
        phase5Data:     window.phase5Data,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("[ICS] localStorage への保存に失敗しました:", e);
    }
  }

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (obj.version !== STORAGE_SCHEMA_VERSION) {
        // バージョン不一致：将来的にマイグレーション処理を追加する場所
        console.warn("[ICS] localStorage のスキーマバージョンが異なります。復元をスキップします。");
        return null;
      }
      return obj;
    } catch (e) {
      console.warn("[ICS] localStorage の読み込みに失敗しました:", e);
      return null;
    }
  }

  function clearLocalStorage() {
    localStorage.removeItem(STORAGE_KEY);
  }

  let _autoSaveTimer = null;
  function debouncedSave() {
    clearTimeout(_autoSaveTimer);
    _autoSaveTimer = setTimeout(saveToLocalStorage, 700);
  }

  function getNodeEl(id) {
    return canvasEl ? canvasEl.querySelector(`.node[data-id="${id}"]`) : null;
  }

  // ================================================================
  // PHASE6 離脱検証ヘルパー
  // ================================================================

  // Phase6 から離脱するときの統一検証。
  // 検証パス時は true を返し、失敗時は state を巻き戻して false を返す。
  // 検証順: 空 → 未配置 → 層未設定
  function validatePhase6Leaving(attemptedPhase, prevPhase) {
    const removedLabels = new Set((window.phase5Data?.removals || []).map(r => r.label));
    const placedLabels  = new Set((phaseData.p6?.nodes || []).map(n => n.label));

    // 1. 空チェック
    if (phaseData.p6.nodes.length === 0) {
      return _bailValidation(prevPhase, attemptedPhase,
        "RECOVERY_MAP_EMPTY",
        "先に復旧期マップを作成してください",
        {}, 3000);
    }

    // 2. 未配置ノードチェック（削除候補以外で未配置のラベルを検出）
    const missingLabels = RECOVERY_PALETTE_NODES
      .map(n => n.label)
      .filter((label, i, arr) => arr.indexOf(label) === i)
      .filter(label => !removedLabels.has(label))
      .filter(label => !placedLabels.has(label));
    if (missingLabels.length > 0) {
      flashMissingPaletteItems(missingLabels);
      return _bailValidation(prevPhase, attemptedPhase,
        "RECOVERY_REQUIRED_NODE_MISSING",
        `未配置のノードがあります：${missingLabels.join("、")}。削除しないノードはすべてキャンバスに追加してください。`,
        { labels: missingLabels }, 5000);
    }

    // 3. layerId 未設定チェック
    const unsetNodes = phaseData.p6.nodes.filter(n => n.layerId === null);
    if (unsetNodes.length > 0) {
      flashUnsetLayerNodes(unsetNodes);
      return _bailValidation(prevPhase, attemptedPhase,
        "RECOVERY_LAYER_UNSET",
        "レイヤーが設定されていない組織名があります。灰色のノードをドラッグして、適切なレイヤーに配置してください。",
        { nodeIds: unsetNodes.map(n => n.id), labels: unsetNodes.map(n => n.label) }, 4000);
    }

    return true;
  }

  function _bailValidation(prevPhase, attemptedPhase, type, msg, extra, toastMs) {
    showToast(msg, toastMs);
    logOp("VALIDATION_ERROR", { type, attemptedPhase, ...extra });
    state.phase = prevPhase;
    activatePhaseView(prevPhase);
    updatePhaseSteps(prevPhase);
    return false;
  }

  // 未配置ラベルに対応するパレット項目を一時的に強調表示
  function flashMissingPaletteItems(labels) {
    const p6Palette = document.getElementById("palette-p6");
    if (!p6Palette) return;
    const targets = new Set(labels);
    p6Palette.querySelectorAll(".pitem").forEach(div => {
      const label = div.querySelector(".plabel")?.textContent;
      if (label && targets.has(label)) {
        div.classList.add("pitem-missing-error");
        setTimeout(() => div.classList.remove("pitem-missing-error"), 2500);
      }
    });
  }

  // layerId 未設定ノードに対応するキャンバス要素を一時的に強調表示
  function flashUnsetLayerNodes(unsetNodes) {
    const p6Canvas = document.getElementById("canvas-p6");
    if (!p6Canvas) return;
    unsetNodes.forEach(n => {
      const el = p6Canvas.querySelector(`.node[data-id="${n.id}"]`);
      if (el) {
        el.classList.add("layer-unset-error");
        setTimeout(() => el.classList.remove("layer-unset-error"), 2500);
      }
    });
  }

  // ================================================================
  // PHASE SWITCHING
  // ================================================================
  window.switchPhase = function(p) {
    const prevPhase      = state.phase;
    const prevStartTime  = state.phaseStartTime;

    // drawingArrow が残留していたら必ずキャンセル
    if (state.drawingArrow) cancelArrowDraw();

    // 比較・分析画面を離れる際にフィット用 transform をリセット
    if (state.phase === PHASE.ACUTE_COMPARE) {
      for (const id of ["canvas-ideal", "svgLayer-ideal", "canvas-actual", "svgLayer-actual"]) {
        const el = $(id);
        if (el) { el.style.transform = ""; el.style.transformOrigin = ""; }
      }
    }
    if (state.phase === PHASE.RECOVERY_COMPARE) {
      for (const id of ["canvas-rcIdeal", "svgLayer-rcIdeal", "canvas-rcActual", "svgLayer-rcActual"]) {
        const el = $(id);
        if (el) { el.style.transform = ""; el.style.transformOrigin = ""; }
      }
    }

    // 現フェーズがマップ画面なら矢印キャンセル＋保存（読み取り専用フェーズは保存不要）
    if (MAP_PHASE_CONFIG[state.phase] && !MAP_PHASE_CONFIG[state.phase].isReadOnly) {
      if (state.drawingArrow) cancelArrowDraw();
      savePhaseData(activePhaseKey);
    }

    state.phase = p;
    // DOM 順ではなく PHASE_VIEW_ID マップでビューを切り替える
    activatePhaseView(p);
    // ヘッダーステップは data-phase 属性で比較する（DOM 順非依存）
    updatePhaseSteps(p);

    // ── 差分提示・レイヤー（急性期） ──────────────────────────────── [NEW]
    // bundleループ（ヒント→自己修正→正解＋WHY）に編集させるため、共通マップハンドラに fall-through する。
    if (p === PHASE.ACUTE_LAYER_DIFF) {
      if (phaseData.acute.nodes.length === 0) {
        showToast("先に急性期マップを作成してください", 3000);
        logOp("VALIDATION_ERROR", { type: "ACUTE_MAP_EMPTY", attemptedPhase: p });
        state.phase = prevPhase;
        activatePhaseView(prevPhase);
        updatePhaseSteps(prevPhase);
        return;
      }
      // レイヤー再入場のたびに毎回再採点する（古い採点結果を残さないため）
      const _layerResult = gradeAcuteLayerPhase();
      if (_layerResult) {
        snapshotAcuteLayerBaseline();
      } else {
        // 採点不能（scoring.js 未読込 / 規範マップ未ロード）時は凍結を見送る。
        // 次回入場時に採点が成功すればそこで凍結される（マップが編集されていなければ同値）。
        logOp("ACUTE_LAYER_BASELINE_SKIPPED", { reason: "grading_unavailable" });
      }
      if (!state.acuteLayerScore) {
        showToast("採点データを準備できませんでした。もう一度お試しください", 3000);
        logOp("VALIDATION_ERROR", { type: "SCORING_UNAVAILABLE", attemptedPhase: p });
        state.phase = prevPhase;
        activatePhaseView(prevPhase);
        updatePhaseSteps(prevPhase);
        return;
      }

      const _ldBackBtn = $("btnDiffBack");
      const _ldNextBtn = $("btnDiffNext");
      if (_ldBackBtn) _ldBackBtn.textContent = "← マップ作成に戻る";
      if (_ldNextBtn) _ldNextBtn.textContent = "確認完了 → 関係付与へ"; // [CHANGED flow-v2] 退出先がPhase13を経ずPhase14へ直結

      const _ldTitle = $("diffTitle");
      if (_ldTitle) _ldTitle.textContent = "レイヤー配置の確認";
      // fall-through → 共通 MAP_PHASE_CONFIG ハンドラが loadPhaseData("acute") / renderAll / _logPhaseTransition を実行
    }

    // ── 差分提示（急性期） ────────────────────────────────────────── [NEW]
    // bundleループに編集させるため、共通マップハンドラに fall-through する。
    if (p === PHASE.ACUTE_DIFF) {
      if (phaseData.acute.nodes.length === 0) {
        showToast("先に急性期マップを作成してください", 3000);
        logOp("VALIDATION_ERROR", { type: "ACUTE_MAP_EMPTY", attemptedPhase: p });
        state.phase = prevPhase;
        activatePhaseView(prevPhase);
        updatePhaseSteps(prevPhase);
        return;
      }
      // 再入場時は再採点しない（ACUTE_REVISED_SCORED.before の基準＝支援なし初回完了時点の
      // 採点結果を汚さないため。既存ガードのまま維持）。
      if (!state.acuteScore) gradeAcutePhase();
      if (!state.acuteScore) {
        showToast("採点データを準備できませんでした。もう一度お試しください", 3000);
        logOp("VALIDATION_ERROR", { type: "SCORING_UNAVAILABLE", attemptedPhase: p });
        state.phase = prevPhase;
        activatePhaseView(prevPhase);
        updatePhaseSteps(prevPhase);
        return;
      }
      snapshotAcuteBaseline();
      // [CHANGED] acuteRevised の初期化を Phase 11 初回入場時から Phase 10 入場時（このタイミング）に前倒し。
      // 以後、bundleループ（Phase 10）〜最終確認（Phase 11）の編集はすべて acuteRevised に書き込まれる。
      ensureAcuteRevisedInitialized();

      const _dBackBtn = $("btnDiffBack");
      const _dNextBtn = $("btnDiffNext");
      if (_dBackBtn) _dBackBtn.textContent = "← マップ作成に戻る";
      if (_dNextBtn) _dNextBtn.textContent = "確認完了 → 比較へ"; // [CHANGED flow-v2] 退出先がPhase11を経ずPhase2へ直結

      const _dTitle = $("diffTitle");
      if (_dTitle) _dTitle.textContent = "関係（矢印）の確認";
      // fall-through → 共通 MAP_PHASE_CONFIG ハンドラが loadPhaseData("acuteRevised") / renderAll / _logPhaseTransition を実行
    }

    // [DEPRECATED flow-v2] ACUTE_REVISE(11) / ACUTE_LAYER_REVISE(13) 入場ブロックは削除済み。
    // 測定点はwalkthrough退出（btnDiffNext）に移設された（修正プロンプト(b) 2-2/2-3）。
    // PHASE定数・PHASE_VIEW_ID・MAP_PHASE_CONFIGのエントリ自体は過去ログ突合のため残置。
    // switchPhase(11)/switchPhase(13) が万一呼ばれても共通 MAP_PHASE_CONFIG ハンドラへ
    // fall-throughするため、致命的なエラーにはならない（ボタン文言・サマリ表示は行われない）。

    // ── 比較・分析（急性期） ─────────────────────────────────────────
    if (p === PHASE.ACUTE_COMPARE) {
      // 未作成チェック
      if (phaseData.acute.nodes.length === 0) {
        showToast("先に急性期の理想マップを作成してください", 3000);
        logOp("VALIDATION_ERROR", { type: "ACUTE_MAP_EMPTY", attemptedPhase: p });
        state.phase = prevPhase;
        activatePhaseView(prevPhase);
        updatePhaseSteps(prevPhase);
        return;
      }
      const acuteUnsetNodes = phaseData.acute.nodes.filter(n => n.layerId === null);
      if (acuteUnsetNodes.length > 0) {
        showToast("レイヤーが設定されていない組織名があります。灰色のノードをドラッグして、適切なレイヤーに配置してください。", 4000);
        logOp("VALIDATION_ERROR", {
          type: "ACUTE_LAYER_UNSET", attemptedPhase: p,
          nodeIds: acuteUnsetNodes.map(n => n.id), labels: acuteUnsetNodes.map(n => n.label)
        });
        const acuteCanvas = document.getElementById("canvas-acute");
        if (acuteCanvas) {
          acuteUnsetNodes.forEach(n => {
            const el = acuteCanvas.querySelector(`.node[data-id="${n.id}"]`);
            if (el) {
              el.classList.add("layer-unset-error");
              setTimeout(() => el.classList.remove("layer-unset-error"), 2500);
            }
          });
        }
        state.phase = prevPhase;
        activatePhaseView(prevPhase);
        updatePhaseSteps(prevPhase);
        return;
      }

      // 採点を実行（表示はしない。結果は state.acuteScore に入る）
      gradeAcutePhase();

      // 描画はグリッドレイアウト確定後に実行
      requestAnimationFrame(() => {
        // 左カラム：学習者の理想マップを描画
        renderReadOnlyMap(
          phaseData.acute.nodes,
          phaseData.acute.edges,
          $("canvas-ideal"),
          $("svgLayer-ideal"),
          $("canvasWrap-ideal"),
          $("canvasStat-ideal"),
          "-ideal",
          null, true,
          () => clearHighlightRO($("canvas-actual"), $("svgLayer-actual"))
        );

        // 右カラム：急性期実際マップを描画
        const actualCanvas = $("canvas-actual");
        const actualSvg    = $("svgLayer-actual");
        const actualWrap   = $("canvasWrap-actual");
        const actualStat   = $("canvasStat-actual");

        if (mapLoadStatus.actualAcute === "ready") {
          renderReadOnlyMap(
            window.actualMapAcute.nodes,
            window.actualMapAcute.edges,
            actualCanvas, actualSvg, actualWrap, actualStat, "-actual",
            null, true,
            () => clearHighlightRO($("canvas-ideal"), $("svgLayer-ideal"))
          );
        } else if (mapLoadStatus.actualAcute === "error") {
          actualCanvas.innerHTML =
            '<div style="color:var(--red);padding:20px;font-size:14px;">⚠ 実際マップの読み込みに失敗しました</div>';
        } else {
          actualCanvas.innerHTML =
            '<div style="color:var(--text-dim);padding:20px;font-size:14px;">読み込み中…</div>';
        }
      });

      // 回答の復元
      const ans  = phaseData.acute.answers;
      const p3q1 = $("p3q1Answer");
      const p3q2 = $("p3q2Answer");
      if (p3q1) {
        p3q1.value = ans.p3q1 || "";
        $("p3q1CharCount").textContent = (ans.p3q1 || "").length;
      }
      if (p3q2) {
        p3q2.value = ans.p3q2 || "";
        $("p3q2CharCount").textContent = (ans.p3q2 || "").length;
      }
      if (ans.p3q2sel) {
        const radio = document.querySelector(
          `input[name="p3q2principle"][value="${ans.p3q2sel}"]`
        );
        if (radio) radio.checked = true;
      }
      _logPhaseTransition(prevPhase, p, prevStartTime);
      showToast("ノードをダブルクリックすると接続関係をハイライトできます", 3500);
      return;
    }

    // ── 対応検証記録（急性期） ─────────────────────────────────────────── [ADDED]
    if (p === PHASE.ACUTE_RECORD) {
      // 前提チェック：ACUTE_COMPARE が未完了なら戻す
      if (phaseData.acute.nodes.length === 0) {
        showToast("先に急性期の比較・分析を完了してください", 3000);
        logOp("VALIDATION_ERROR", { type: "ACUTE_MAP_EMPTY", attemptedPhase: p });
        state.phase = prevPhase;
        activatePhaseView(prevPhase);
        updatePhaseSteps(prevPhase);
        return;
      }
      _logPhaseTransition(prevPhase, p, prevStartTime);
      renderAcuteRecordView();
      restoreAcuteRecordAnswers();
      renderSelectedPrinciple("arSelectedPrinciple", phaseData.acute.answers.p3q2sel, "問2で原則を選択すると表示されます");
      const arInstr = $("arSidebarInstruction");
      if (arInstr) {
        arInstr.textContent = phaseData.acute.answers.p3q2sel === "該当なし"
          ? "問2で「該当なし」を選択したため、問3はスキップされます。問4に回答してください。"
          : "対応検証記録の抜粋を読んだ上で問3・問4に回答してください。";
      }
      return;
    }

    // ── 急性期・復旧期構造比較 ──────────────────────────────────────────── [NEW]
    if (p === PHASE.TRANSITION_COMPARE) {
      if (!validatePhase6Leaving(p, prevPhase)) return;
      BENEFICIARY_LABELS = PHASE6_BENEFICIARY_LABELS;
      requestAnimationFrame(() => {
        // 左カラム：学習者の復旧期マップ（⑧と同様）
        renderReadOnlyMap(
          phaseData.p6.nodes,
          phaseData.p6.edges,
          $("canvas-tcRecovery"),
          $("svgLayer-tcRecovery"),
          $("canvasWrap-tcRecovery"),
          $("canvasStat-tcRecovery"),
          "-tcRecovery",
          null, true,
          () => clearHighlightRO($("canvas-tcAcute"), $("svgLayer-tcAcute"))
        );
        // 右カラム：急性期理想マップ（ideal_map_acute.json）
        const tcAcuteCanvas = $("canvas-tcAcute");
        if (mapLoadStatus.idealAcute === "ready") {
          renderReadOnlyMap(
            window.idealMapAcute.nodes,
            window.idealMapAcute.edges,
            tcAcuteCanvas,
            $("svgLayer-tcAcute"),
            $("canvasWrap-tcAcute"),
            $("canvasStat-tcAcute"),
            "-tcAcute",
            null, true,
            () => clearHighlightRO($("canvas-tcRecovery"), $("svgLayer-tcRecovery"))
          );
        } else if (mapLoadStatus.idealAcute === "error") {
          if (tcAcuteCanvas) tcAcuteCanvas.innerHTML =
            '<div style="color:var(--red);padding:20px;font-size:14px;">⚠ 急性期マップの読み込みに失敗しました</div>';
        } else {
          if (tcAcuteCanvas) tcAcuteCanvas.innerHTML =
            '<div style="color:var(--text-dim);padding:20px;font-size:14px;">読み込み中…</div>';
        }
      });
      // 回答の復元と入力ハンドラ登録
      const tcAns = phaseData.transitionCompare.answers;
      const tcQ6el = $("tcQ6Answer");
      const tcQ6cc = $("tcQ6CharCount");
      if (tcQ6el) {
        tcQ6el.value = tcAns.q6 || "";
        if (tcQ6cc) tcQ6cc.textContent = (tcAns.q6 || "").length;
        const freshTc = tcQ6el.cloneNode(true);
        freshTc.value = tcQ6el.value;
        tcQ6el.replaceWith(freshTc);
        const tcState = { started: false, editCount: 0, maxLengthReached: freshTc.value.length };
        freshTc.addEventListener("focus", () => {
          if (!tcState.started) {
            tcState.started = true;
            tcState.editCount = 0;
            tcState.maxLengthReached = freshTc.value.length;
            logOp("ANSWER_START", { questionId: "transitionCompare.q6" });
          }
        });
        freshTc.addEventListener("input", () => {
          tcState.editCount += 1;
          tcState.maxLengthReached = Math.max(tcState.maxLengthReached, freshTc.value.length);
          phaseData.transitionCompare.answers.q6 = freshTc.value;
          if (tcQ6cc) tcQ6cc.textContent = freshTc.value.length;
          debouncedSave();
        });
        freshTc.addEventListener("blur", () => {
          if (tcState.editCount === 0) return;
          logOp("ANSWER_CHANGE", {
            questionId: "transitionCompare.q6",
            valueLength: freshTc.value.length,
            editCount: tcState.editCount,
            maxLengthReached: tcState.maxLengthReached
          });
          tcState.editCount = 0;
        });
      }
      _logPhaseTransition(prevPhase, p, prevStartTime);
      showToast("ノードをダブルクリックすると接続関係をハイライトできます", 3500);
      return;
    }

    // ── 復旧期比較・分析 ─────────────────────────────────────────────────── [ADDED]
    if (p === PHASE.RECOVERY_COMPARE) {
      if (!validatePhase6Leaving(p, prevPhase)) return;
      BENEFICIARY_LABELS = PHASE6_BENEFICIARY_LABELS;

      requestAnimationFrame(() => {
        // 左カラム：学習者の復旧期理想マップ
        renderReadOnlyMap(
          phaseData.p6.nodes,
          phaseData.p6.edges,
          $("canvas-rcIdeal"),
          $("svgLayer-rcIdeal"),
          $("canvasWrap-rcIdeal"),
          $("canvasStat-rcIdeal"),
          "-rcIdeal",
          null, true,
          () => clearHighlightRO($("canvas-rcActual"), $("svgLayer-rcActual"))
        );

        // 右カラム：復旧期実際マップ
        const rcActualCanvas = $("canvas-rcActual");
        if (mapLoadStatus.actualRecovery === "ready") {
          renderReadOnlyMap(
            window.actualMapRecovery.nodes,
            window.actualMapRecovery.edges,
            rcActualCanvas,
            $("svgLayer-rcActual"),
            $("canvasWrap-rcActual"),
            $("canvasStat-rcActual"),
            "-rcActual",
            null, true,
            () => clearHighlightRO($("canvas-rcIdeal"), $("svgLayer-rcIdeal"))
          );
        } else if (mapLoadStatus.actualRecovery === "error") {
          if (rcActualCanvas) rcActualCanvas.innerHTML =
            '<div style="color:var(--red);padding:20px;font-size:14px;">⚠ 実際マップの読み込みに失敗しました</div>';
        } else {
          if (rcActualCanvas) rcActualCanvas.innerHTML =
            '<div style="color:var(--text-dim);padding:20px;font-size:14px;">読み込み中…</div>';
        }
      });

      // 回答の復元
      const rcAns = phaseData.recoveryCompare.answers;
      const q6el = $("rcQ6Answer");
      const q7el = $("rcQ7Answer");
      if (q6el) {
        q6el.value = rcAns.q6 || "";
        const cc = $("rcQ6CharCount");
        if (cc) cc.textContent = (rcAns.q6 || "").length;
      }
      if (q7el) {
        q7el.value = rcAns.q7 || "";
        const cc = $("rcQ7CharCount");
        if (cc) cc.textContent = (rcAns.q7 || "").length;
      }
      if (rcAns.q7sel) {
        const radio = document.querySelector(`input[name="rcQ7principle"][value="${rcAns.q7sel}"]`);
        if (radio) radio.checked = true;
      }
      _logPhaseTransition(prevPhase, p, prevStartTime);
      showToast("ノードをダブルクリックすると接続関係をハイライトできます", 3500);
      return;
    }

    // ── 対応検証記録（復旧期） ────────────────────────────────────────────
    if (p === PHASE.RECOVERY_RECORD) {
      if (!validatePhase6Leaving(p, prevPhase)) return;
      _logPhaseTransition(prevPhase, p, prevStartTime);
      renderRecoveryRecordView();
      restoreRecoveryRecordAnswers();
      renderSelectedPrinciple("rrSelectedPrinciple", phaseData.recoveryCompare.answers.q7sel, "問7で原則を選択すると表示されます");
      const rrInstr = $("rrSidebarInstruction");
      if (rrInstr) rrInstr.textContent = "問6・問7を踏まえて問8に回答してください。";
      return;
    }

    // 他フェーズに遷移する場合はサブフェーズをリセット
    if (p !== PHASE.ACUTE_MAP && p !== PHASE.ACUTE_EDGE_MAP) {
      state.acuteSubPhase = null;
    }

    // ── マップ系フェーズ共通（急性期マップ・復旧期準備・復旧期マップ） ───
    const cfg = MAP_PHASE_CONFIG[p];
    if (cfg) {
      if (cfg.isReadOnly) {
        // 復旧期準備：読み取り専用モード
        activePhaseKey     = cfg.key;
        BENEFICIARY_LABELS = cfg.beneficiaries;
        canvasEl           = $(cfg.domIds.canvas);
        svgEl              = $(cfg.domIds.svg);
        canvasWrap         = $(cfg.domIds.wrap);
        activeCanvasStatEl = $(cfg.domIds.stat);
        activeArrowHintEl  = null;
        activeMarkerSuffix = cfg.markerSuffix;
        activePaletteNodes = [];
        renderPhase5Map();
        _logPhaseTransition(prevPhase, p, prevStartTime);
      } else {
        // 通常モード（急性期マップ・復旧期マップ）
        activePhaseKey     = cfg.key;
        activePaletteNodes = cfg.paletteNodes;
        BENEFICIARY_LABELS = cfg.beneficiaries;
        canvasEl           = $(cfg.domIds.canvas);
        svgEl              = $(cfg.domIds.svg);
        paletteEl          = $(cfg.domIds.palette);
        canvasWrap         = $(cfg.domIds.wrap);
        activeCanvasStatEl = $(cfg.domIds.stat);
        activeArrowHintEl  = $(cfg.domIds.hint);
        activeMarkerSuffix = cfg.markerSuffix;

        if (p === PHASE.RECOVERY_MAP) {
          // ヘッダーからの直接遷移も含め、削除候補が未選択なら復旧期準備に誘導する
          if (window.phase5Data.removals.length === 0) {
            showToast("先に復旧期準備で不要なノードを選択してください", 3000);
            logOp("VALIDATION_ERROR", { type: "RECOVERY_REMOVAL_EMPTY", attemptedPhase: p });
            state.phase = prevPhase;
            activatePhaseView(prevPhase);
            updatePhaseSteps(prevPhase);
            return;
          }
          // 未初期化、または削除候補が変わった場合に再構築する。
          if (p6NeedsRebuild()) {
            initPhase6Canvas();
          }
        }
        loadPhaseData(cfg.key);
        renderPalette();
        renderAll();

        // ── Phase 1 (ACUTE_MAP) サブフェーズ初期化 ──────────────────────
        if (p === PHASE.ACUTE_MAP) {
          // サブフェーズが未設定なら L1_COMMAND から開始
          if (!state.acuteSubPhase) {
            state.acuteSubPhase = ACUTE_SUB.L1_COMMAND;
          }

          // 支援対象ノードを未配置の場合のみ初期配置（再進入時の上書きを防ぐ）
          const alreadyHasInitial = state.nodes.some(n => n.isInitial);
          if (!alreadyHasInitial) {
            requestAnimationFrame(() => {
              const rect = canvasWrap.getBoundingClientRect();
              const h = rect.height || 600;
              const w = rect.width  || 800;
              const yPos = Math.round(h * 0.87);
              const initLabels = ["避難所", "医療機関"];
              const spacing = w / (initLabels.length + 1);
              initLabels.forEach((label, i) => {
                const pallNode = PALETTE_NODES.find(n => n.label === label);
                state.nodes.push({
                  id: "n-" + uid(),
                  label,
                  group: pallNode?.group || "g-team",
                  x: Math.round(spacing * (i + 1) - 75),
                  y: yPos,
                  layerId: 4,
                  layerReason: "",
                  isInitial: true,
                });
              });
              logOp("ACUTE_INITIAL_NODES_PLACED", { labels: initLabels });
              renderAll();
              saveToLocalStorage();
            });
          }

          // チュートリアルバーをサブフェーズに合わせて更新
          requestAnimationFrame(() => {
            setAcuteSubPhase(state.acuteSubPhase, false);
            updateTooltipToggleBtn();
          });
        }

        // ── Phase 14 (ACUTE_EDGE_MAP) 初期化 ────────────────────────── [NEW]
        // ノードは全て配置済みのため初期ノード配置は行わず、サブフェーズを EDGE 固定するのみ。
        if (p === PHASE.ACUTE_EDGE_MAP) {
          state.acuteSubPhase = ACUTE_SUB.EDGE;
          requestAnimationFrame(() => {
            setAcuteSubPhase(ACUTE_SUB.EDGE, false);
            updateTooltipToggleBtn();
          });
        }

        // ── Phase 12/10 (ACUTE_LAYER_DIFF / ACUTE_DIFF) bundleループ初期化 ── [NEW]
        // renderAll() 完了後（DOM 描画後）に呼ぶ必要があるため requestAnimationFrame を挟む。
        if (p === PHASE.ACUTE_LAYER_DIFF) {
          requestAnimationFrame(() => initBundleLoop(state.acuteLayerScore?.layerErrors || [], "layer"));
        }
        if (p === PHASE.ACUTE_DIFF) {
          requestAnimationFrame(() => initBundleLoop(
            // エッジ差分段階では layer_mismatch を構造的に除外する。
            // スナップ（プロンプト2）により実測0件のはずだが、万一残存しても
            // レイヤー系ステップがエッジ差分に混入しないことをコードで保証する。
            (state.acuteScore?.errors || []).filter(e => e.category !== "layer_mismatch"), "edge"
          ));
        }

        // [DEPRECATED flow-v2] Phase 11 最終確認初期化は削除。残エラー表示はwalkthrough
        // 完了画面（index=N）に統合された（修正プロンプト(b) 2-4）。

        _logPhaseTransition(prevPhase, p, prevStartTime);
      }
    }
    if (p === PHASE.ORIENTATION) tutorialBeginIfVisible();
  };
  // data-phase 属性の値を使うことで、DOM順の index に依存しない
  phaseSteps.forEach(s => s.addEventListener("click", () => switchPhase(parseInt(s.dataset.phase, 10))));
  $("btnStartMap").addEventListener("click", () => switchPhase(PHASE.ACUTE_MAP));

  // ================================================================
  // PALETTE
  // ================================================================
  function renderPalette() {
    paletteEl.innerHTML = "";

    // Phase 1 / Phase 6: 配置済みラベルを集合として保持し、重複追加を防ぐ
    const placedLabels = (activePhaseKey === "p6" || activePhaseKey === "acute")
      ? new Set(state.nodes.map(n => n.label))
      : null;

    // Phase6: 削除候補ラベルの集合（優先度最高）
    const removedLabels = (activePhaseKey === "p6")
      ? new Set((window.phase5Data?.removals || []).map(r => r.label))
      : new Set();

    for (const n of activePaletteNodes) {
      const div = document.createElement("div");
      // group は内部メタデータ。パレット item に group クラスを付与しない（layer のみで色を表現）
      div.className = "pitem";
      if (BENEFICIARY_LABELS.has(n.label)) div.classList.add("node-beneficiary");

      const isRemoved = removedLabels.has(n.label);
      // 削除優先のため、削除候補のときは配置済み判定をスキップ
      const isPlaced  = !isRemoved && (placedLabels?.has(n.label) ?? false);

      if (isRemoved)     div.classList.add("pitem-removed");
      else if (isPlaced) div.classList.add("pitem-placed");

      const tagText = isRemoved ? "削除" : isPlaced ? "配置済み" : "＋追加";

      div.innerHTML = `
        <span class="pico">${n.icon || ""}</span>
        <span class="plabel">${esc(n.label)}</span>
        <span class="ptag">${tagText}</span>
      `;

      if (!isRemoved && !isPlaced) {
        div.addEventListener("click", () => {
          addNode(n.label, n.group);
          logOp("ADD_NODE", { label: n.label, group: n.group });
        });
      }

      // Phase 1 ツールチップ（エッジ段階でも組織説明は有用なため 14 を追加） [CHANGED]
      if (state.phase === PHASE.ACUTE_MAP || state.phase === PHASE.ACUTE_EDGE_MAP) {
        div.addEventListener("mouseenter", () => showAcuteTooltip(n.label, div));
        div.addEventListener("mouseleave", hideAcuteTooltip);
      }

      paletteEl.appendChild(div);
    }
  }

  // ================================================================
  // NODE OPERATIONS
  // ================================================================
  function addNode(label, group) {
    const rect = canvasWrap.getBoundingClientRect();
    const x = 80 + Math.floor(Math.random() * Math.max(rect.width - 280, 80));
    const isBenef = BENEFICIARY_LABELS.has(label);
    const y = isBenef
      ? getCenterYForLayer(4)
      : 60 + Math.floor(Math.random() * Math.max(rect.height - 120, 60));
    const id = "n-" + uid();
    state.nodes.push({ id, label, group, x, y, layerId: isBenef ? 4 : null, layerReason: "" });
    renderAll();
    selectNode(id);
    saveToLocalStorage();
  }

  function selectNode(id) {
    if (state.selectedNodeId === id) {
      clearSelection();
      return;
    }
    state.selectedNodeId = id;
    state.selectedEdgeId = null;
    const n = state.nodes.find(x => x.id === id);
    if (!n) return;
    canvasEl.querySelectorAll(".node").forEach(el => el.classList.remove("selected"));
    getNodeEl(id)?.classList.add("selected");
    // 削除ボタンの表示切替
    canvasEl.querySelectorAll(".node-delete-btn").forEach(b => b.style.display = "none");
    const btn = getNodeEl(id)?.querySelector(".node-delete-btn");
    if (btn) btn.style.display = "flex";
    updateQ1Select();
  }

  function clearSelection() {
    state.selectedNodeId = null;
    clearHighlight();
    canvasEl?.querySelectorAll(".node").forEach(el => el.classList.remove("selected"));
    canvasEl?.querySelectorAll(".node-delete-btn").forEach(b => b.style.display = "none");
  }

  function applyHighlight(selectedId) {
    const connected = new Set();
    for (const e of state.edges) {
      if (e.from === selectedId) connected.add(e.to);
      if (e.to   === selectedId) connected.add(e.from);
    }
    canvasEl.querySelectorAll(".node").forEach(el => {
      el.classList.remove("node-focus", "node-active", "node-dim");
      const nid = el.dataset.id;
      if (nid === selectedId)      el.classList.add("node-focus");
      else if (connected.has(nid)) el.classList.add("node-active");
      else                         el.classList.add("node-dim");
    });
    svgEl.querySelectorAll("g[data-from]").forEach(g => {
      const isActive = g.dataset.from === selectedId || g.dataset.to === selectedId;
      g.setAttribute("opacity", isActive ? "1" : "0.1");
      if (isActive) {
        g.style.filter = "drop-shadow(0 0 4px rgba(255,255,255,0.35))";
      }
    });
  }

  function clearHighlight() {
    state.highlightNodeId = null;
    canvasEl?.querySelectorAll(".node").forEach(el => {
      el.classList.remove("node-focus", "node-active", "node-dim");
    });
    svgEl?.querySelectorAll("g[data-from]").forEach(g => {
      g.setAttribute("opacity", "1");
      g.style.filter = "";
    });
  }

  function applyHighlightRO(selectedId, nodes, edges, panelCanvas, panelSvg) {
    const connected = new Set();
    for (const e of edges) {
      if (e.from === selectedId) connected.add(e.to);
      if (e.to   === selectedId) connected.add(e.from);
    }
    panelCanvas.querySelectorAll(".node").forEach(el => {
      el.classList.remove("node-focus", "node-active", "node-dim");
      const nid = el.dataset.id;
      if      (nid === selectedId)  el.classList.add("node-focus");
      else if (connected.has(nid))  el.classList.add("node-active");
      else                          el.classList.add("node-dim");
    });
    panelSvg.querySelectorAll("g[data-from]").forEach(g => {
      const active = g.dataset.from === selectedId || g.dataset.to === selectedId;
      g.setAttribute("opacity", active ? "1" : "0.1");
      g.style.filter = active
        ? "drop-shadow(0 0 4px rgba(255,255,255,0.35))"
        : "";
    });
  }

  function clearHighlightRO(panelCanvas, panelSvg) {
    panelCanvas?.querySelectorAll(".node")
      .forEach(el => el.classList.remove("node-focus", "node-active", "node-dim"));
    panelSvg?.querySelectorAll("g[data-from]").forEach(g => {
      g.setAttribute("opacity", "1");
      g.style.filter = "";
    });
  }

  // Phase5 の削除候補リストを一意なシグネチャ文字列に変換する。
  // nodeId をソートして結合するため、同一セットなら挿入順によらず同じ値になる。
  function getRemovalSignature() {
    return window.phase5Data.removals
      .map(r => r.nodeId)
      .sort()
      .join(",");
  }

  // Phase6 に「ユーザーが加えた編集」が存在するかを判定する。
  // isInitial=false のノード（自分で追加したもの）または矢印が1本以上あれば編集済み。
  // toggleRemovalCandidate() で confirm を出すかどうかの判断に使う。
  function hasP6Edits() {
    return phaseData.p6.nodes.some(n => !n.isInitial) || phaseData.p6.edges.length > 0;
  }

  // Phase6 の再構築（initPhase6Canvas の再実行）が必要かどうかを判定する。
  // ・未初期化（phase6Initialized=false）
  // ・削除候補が変わった（現在のシグネチャ ≠ 構築時のシグネチャ）
  // のどちらかで true を返す。switchPhase(RECOVERY_MAP) はこの関数でのみ再構築の要否を判断する。
  function p6NeedsRebuild() {
    return !phase6Initialized || getRemovalSignature() !== phase6RemovalSignature;
  }

  // Phase6 を「無効化済み」状態にセットする。
  // 呼び出し後は p6NeedsRebuild()=true となり、次回 Phase6 入場時に initPhase6Canvas() が走る。
  // phaseData.p6 も即時クリアして stale データの誤利用を防ぐ。
  // この関数が Phase6 の「初期化フラグ + シグネチャ + データ」をまとめてリセットする唯一の責務を持つ。
  function invalidatePhase6() {
    phase6Initialized      = false;
    phase6RemovalSignature = "";
    phaseData.p6 = {
      nodes: [], edges: [], answers: { q1: "", q2: "" },
      log: [], selectedNodeId: null, selectedEdgeId: null,
    };
  }

  function deleteNode(id) {
    const n = state.nodes.find(x => x.id === id);
    if (n?.isInitial) {
      showToast("急性期理想マップ由来のノードは削除できません");
      return;
    }
    // レイヤー配置／関係付与／マップ修正（層・関係）／差分bundleループの各フェーズではノード削除不可
    const isNodeDeleteBlockedPhase =
      state.phase === PHASE.ACUTE_MAP ||
      state.phase === PHASE.ACUTE_EDGE_MAP ||
      state.phase === PHASE.ACUTE_REVISE ||
      state.phase === PHASE.ACUTE_LAYER_REVISE ||
      state.phase === PHASE.ACUTE_DIFF ||
      state.phase === PHASE.ACUTE_LAYER_DIFF;
    if (isNodeDeleteBlockedPhase) {
      showToast("このフェーズではノードを削除できません");
      return;
    }
    if (!confirm(`「${n?.label}」を削除しますか？`)) return;
    const removedEdges = state.edges.filter(e => e.from === id || e.to === id);
    const edgeIds = removedEdges.map(e => e.id);
    const deletedEdgeCount = edgeIds.length;
    state.edges = state.edges.filter(e => e.from !== id && e.to !== id);
    state.nodes = state.nodes.filter(n => n.id !== id);
    state.selectedNodeId = null;
    logOp("DELETE_NODE", { id, label: n?.label, deletedEdgeCount, edgeIds });
    renderAll();
    saveToLocalStorage();
  }

  // ================================================================
  // NODE DOM RENDER
  // ================================================================
  function renderNodes() {
    canvasEl.innerHTML = "";
    const cfg = MAP_PHASE_CONFIG[state.phase];
    const isReadOnly = !!(cfg?.isReadOnly);

    // Phase 1 サブフェーズフラグ（14 も同じビュー・データを使うため対象に含める） [CHANGED]
    const isAcute1 = state.phase === PHASE.ACUTE_MAP || state.phase === PHASE.ACUTE_EDGE_MAP;
    const isEdgeSub = isAcute1 && state.acuteSubPhase === ACUTE_SUB.EDGE;

    for (const n of state.nodes) {
      const div = document.createElement("div");
      const layerClass = n.layerId ? `layer-${n.layerId}` : "layer-none";
      const benefClass = BENEFICIARY_LABELS.has(n.label) ? " node-beneficiary" : "";
      // group は内部メタデータ。class には layer と beneficiary のみ反映する
      // フェーズ11（最終確認のみ）は setupDrag を呼ばないため、grab カーソルも出さない
      const isDraggablePhase = !isReadOnly && state.phase !== PHASE.ACUTE_REVISE;
      div.className = `node ${isDraggablePhase ? "draggable " : ""}${layerClass}${benefClass}`;
      div.dataset.id = n.id;
      div.style.left = n.x + "px";
      div.style.top  = n.y + "px";
      if (n.id === state.selectedNodeId) div.classList.add("selected");

      div.innerHTML = `<div class="ntitle">${esc(n.label)}</div>`;

      if (!isReadOnly) {
        // Phase 1A では接続ボタンを非表示（EDGE サブフェーズのみ表示）。
        // フェーズ13・12（レイヤー系）はエッジ操作禁止のため常に非表示。フェーズ10（エッジ差分bundleループ）は表示する。
        // フェーズ11（最終確認のみ）はエッジ編集不可のため非表示（クリックしても no-op になる死んだボタンを防ぐ）。
        const showConnectBtn = (!isAcute1 || isEdgeSub)
          && state.phase !== PHASE.ACUTE_LAYER_REVISE
          && state.phase !== PHASE.ACUTE_LAYER_DIFF
          && state.phase !== PHASE.ACUTE_REVISE;
        div.innerHTML += `<div class="node-connect-btn" data-nid="${n.id}" title="矢印を引く" style="${showConnectBtn ? "" : "display:none"}">→</div>`;

        // 削除ボタン: 急性期マップ構築フェーズ（1/14）・修正フェーズ（11/13）・差分bundleループ（10/12）・isInitial ノードは非表示
        const isRevise = state.phase === PHASE.ACUTE_REVISE || state.phase === PHASE.ACUTE_LAYER_REVISE
          || state.phase === PHASE.ACUTE_DIFF || state.phase === PHASE.ACUTE_LAYER_DIFF;
        if (!n.isInitial && !isAcute1 && !isRevise) {
          const deleteBtn = document.createElement("div");
          deleteBtn.className = "node-delete-btn";
          deleteBtn.textContent = "×";
          deleteBtn.style.display = n.id === state.selectedNodeId ? "flex" : "none";
          deleteBtn.addEventListener("click", e => {
            e.stopPropagation();
            deleteNode(n.id);
          });
          div.appendChild(deleteBtn);
        }
      }

      // Phase 1 ツールチップ（mouseenter/mouseleave）
      if (isAcute1) {
        div.addEventListener("mouseenter", () => showAcuteTooltip(n.label, div));
        div.addEventListener("mouseleave", hideAcuteTooltip);
      }

      // Phase 6 ツールチップ
      if (activePhaseKey === "p6") {
        div.addEventListener("mouseenter", () => showNodeTooltip(n.label, div, "p6NodeTooltip"));
        div.addEventListener("mouseleave", () => hideNodeTooltip("p6NodeTooltip"));
      }

      // 削除候補クラス（Phase5）
      if (isReadOnly && window.phase5Data.removals.some(r => r.nodeId === n.id)) {
        div.classList.add("node-removal-candidate");
      }

      // 急性期引き継ぎノード（Phase6）
      if (n.isInitial) {
        div.classList.add("node-initial");
      }

      // Click on node div
      div.addEventListener("click", e => {
        e.stopPropagation();

        // 読み取り専用フェーズのクリックはコールバックで処理
        if (isReadOnly) {
          toggleRemovalCandidate(n.id, n.label);
          return;
        }

        // connect-btn / delete-btn のクリックは無視
        if (e.target.classList.contains("node-connect-btn")) return;
        if (e.target.classList.contains("node-delete-btn")) return;

        // 矢印描画モード中はターゲット選択として処理
        if (state.drawingArrow) {
          if (state.arrowFrom !== n.id) {
            finishArrow(n.id, e.clientX, e.clientY);
          }
          return;
        }

        // 通常クリック
        clearTimeout(_clickTimer);
        _clickTimer = setTimeout(() => { selectNode(n.id); }, 250);
      });

      // Double-click: ハイライトモード発動 / 解除
      div.addEventListener("dblclick", e => {
        e.stopPropagation();
        if (isReadOnly) return;
        if (e.target.classList.contains("node-connect-btn")) return;
        if (e.target.classList.contains("node-delete-btn")) return;
        clearTimeout(_clickTimer);
        if (state.highlightNodeId === n.id) {
          clearHighlight();
        } else {
          state.highlightNodeId = n.id;
          applyHighlight(n.id);
        }
      });

      // Arrow hover highlight while drawing
      if (!isReadOnly) {
        div.addEventListener("mouseenter", () => {
          if (state.drawingArrow && state.arrowFrom !== n.id) {
            div.classList.add("arrow-target-hover");
          }
        });
        div.addEventListener("mouseleave", () => {
          div.classList.remove("arrow-target-hover");
        });

        // Drag to move（Phase 11＝最終確認のみのフェーズではドラッグ移動不可）
        if (state.phase !== PHASE.ACUTE_REVISE) {
          setupDrag(div, n);
        }
      }

      canvasEl.appendChild(div);
    }

    // Connect buttons: stop ALL propagation so click never reaches parent node div
    if (!isReadOnly) {
      canvasEl.querySelectorAll(".node-connect-btn").forEach(btn => {
        btn.addEventListener("mousedown", e => { e.stopPropagation(); e.preventDefault(); });
        btn.addEventListener("click", e => {
          e.stopPropagation();
          e.preventDefault();
          startArrowDraw(btn.dataset.nid);
        });
      });
    }

    // Canvas background click: only deselect; never cancel arrow (Esc key does that)
    // canvasEl は pointer-events:none のため、空白クリックは canvasWrap に届く
    canvasWrap.onclick = e => {
      if (isReadOnly) return;
      if (state.drawingArrow) return;
      if (e.target !== canvasWrap) return;
      clearSelection();
      if (state.selectedEdgeId) { state.selectedEdgeId = null; renderEdges(); }
    };
  }

  // ================================================================
  // DRAG-TO-MOVE
  // ================================================================
  function setupDrag(div, n) {
    div.addEventListener("pointerdown", e => {
      if (state.drawingArrow) return;
      if (e.target.classList.contains("node-connect-btn")) return;
      if (e.target.classList.contains("node-delete-btn")) return;
      e.preventDefault();
      div.setPointerCapture(e.pointerId);
      // ドラッグ中は削除ボタンを非表示（誤タップ防止）
      const delBtn = div.querySelector(".node-delete-btn");
      if (delBtn) delBtn.style.display = "none";
      const sx = e.clientX, sy = e.clientY, bx = n.x, by = n.y;
      const oldLayerId = n.layerId;
      let moved = false;
      let layerLockToastShown = false;

      const onMove = ev => {
        moved = true;
        const rect = canvasWrap.getBoundingClientRect();
        n.x = clamp(bx + ev.clientX - sx, 0, rect.width - 200);
        n.y = clamp(by + ev.clientY - sy, 0, rect.height - 80);
        // フェーズ14・10: レイヤーロック。ノードは自層の帯内でのみ移動可（y をクランプ）。
        // フェーズ10（エッジ差分bundleループ）でも層は既に確定済みのため、矢印描画の微調整で
        // ドラッグしても層がずれないようにする（layerId は onUp で y から再判定されるため）。
        if ((state.phase === PHASE.ACUTE_EDGE_MAP || state.phase === PHASE.ACUTE_DIFF) && n.layerId) {
          const bandTop    = rect.height * (n.layerId - 1) * 0.25;
          const bandBottom = rect.height * n.layerId * 0.25 - 1;
          const clampedY   = clamp(n.y, bandTop, bandBottom);
          if (clampedY !== n.y && !layerLockToastShown) {
            showToast("この段階ではレイヤーは変更できません（同じ層の中での位置調整は可能です）", 2500);
            layerLockToastShown = true;   // ドラッグ1回につき最大1回
          }
          n.y = clampedY;
        }
        div.style.left = n.x + "px";
        div.style.top  = n.y + "px";
        highlightLayer(getLayerIdFromY(n.y));
        renderEdges();
        updateCanvasStat();
      };
      const onUp = () => {
        div.removeEventListener("pointermove", onMove);
        div.removeEventListener("pointerup", onUp);
        div.releasePointerCapture(e.pointerId);
        clearLayerHighlight();
        if (moved) {
          if (!BENEFICIARY_LABELS.has(n.label)) {
            n.layerId = getLayerIdFromY(n.y);
            // 層クラスをノード要素に即時反映
            div.classList.remove("layer-none", "layer-1", "layer-2", "layer-3", "layer-4");
            div.classList.add(`layer-${n.layerId}`);
          }
          logOp("MOVE_NODE", {
            id: n.id, label: n.label,
            from: { x: bx, y: by, layerId: oldLayerId },
            to:   { x: n.x, y: n.y, layerId: n.layerId }
          });
          if (oldLayerId !== n.layerId) {
            logOp("SET_LAYER", { id: n.id, label: n.label, fromLayerId: oldLayerId, toLayerId: n.layerId });
          }
          saveToLocalStorage();
          maybeRerenderAnswerStageAfterEdit(); // [adaptive_v1] ドロップ確定時のみ（ドラッグ中は再計算しない）
        }
      };
      div.addEventListener("pointermove", onMove);
      div.addEventListener("pointerup", onUp);
    });
  }

  // ================================================================
  // LAYER HELPERS
  // ================================================================
  function getLayerIdFromY(y) {
    const rect = canvasWrap.getBoundingClientRect();
    const pct = y / rect.height;
    if (pct < 0.25) return 1;
    if (pct < 0.50) return 2;
    if (pct < 0.75) return 3;
    return 4;
  }

  // getLayerIdFromY() の逆関数。layerId の層中央 y 座標を返す。
  // canvasWrap が非表示のとき rect.height=0 になるためフォールバックを持つ。
  function getCenterYForLayer(layerId) {
    const rect = canvasWrap?.getBoundingClientRect();
    const h = rect?.height || 600;
    return Math.floor(h * (layerId * 0.25 - 0.125));
  }

  function highlightLayer(layerId) {
    canvasWrap.querySelectorAll(".layer-band").forEach(b => {
      b.classList.toggle("active", +b.dataset.layer === layerId);
    });
  }

  function clearLayerHighlight() {
    canvasWrap.querySelectorAll(".layer-band").forEach(b => b.classList.remove("active"));
  }

  // ================================================================
  // ARROW DRAWING — PowerPoint style
  // ================================================================
  function startArrowDraw(fromId) {
    // フェーズ13・12（レイヤー系）とフェーズ11（最終確認のみ）はエッジ操作禁止
    if (state.phase === PHASE.ACUTE_LAYER_REVISE
      || state.phase === PHASE.ACUTE_LAYER_DIFF
      || state.phase === PHASE.ACUTE_REVISE) return;
    clearHighlight();
    const fromNode = state.nodes.find(n => n.id === fromId);
    if (BENEFICIARY_LABELS.has(fromNode?.label)) return; // 被支援者ノードからは矢印不可
    state.arrowFrom = fromId;
    state.drawingArrow = true;
    canvasWrap.classList.add("drawing-arrow");

    // highlight source node
    canvasEl.querySelectorAll(".node").forEach(el => el.classList.remove("arrow-source"));
    getNodeEl(fromId)?.classList.add("arrow-source");

    // show hint
    if (activeArrowHintEl) activeArrowHintEl.style.display = "flex";

    // mousemove on canvas for rubber-band preview
    canvasWrap.addEventListener("mousemove", onArrowMouseMove);
    // escape key cancel
    document.addEventListener("keydown", onArrowKeyDown);

    logOp("START_ARROW", { fromId, fromLabel: fromNode?.label || "" });
  }

  function onArrowMouseMove(e) {
    if (!state.drawingArrow) return;
    const rect = canvasWrap.getBoundingClientRect();
    state.previewEnd = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    renderArrowPreview();
  }

  function onArrowKeyDown(e) {
    if (e.key === "Escape") cancelArrowDraw();
  }

  function finishArrow(toId, clientX, clientY) {
    if (!state.drawingArrow || !state.arrowFrom) return;
    if (state.arrowFrom === toId) { cancelArrowDraw(); return; }

    const fromId = state.arrowFrom;
    clearArrowDrawState(); // 内部クリーンアップのみ（CANCEL_ARROW ログなし）
    // 支援対象（BENEFICIARY_LABELS に含まれるノード）への矢印は「支援」ラベルを自動付与
    const toNode = state.nodes.find(n => n.id === toId);
    if (BENEFICIARY_LABELS.has(toNode?.label)) {
      addEdgeWithLabel(fromId, toId, "支援");
      return;
    }
    showEdgeLabelPopup(fromId, toId, clientX, clientY);
  }

  function clearArrowDrawState() {
    state.drawingArrow = false;
    state.arrowFrom = null;
    canvasWrap.classList.remove("drawing-arrow");
    canvasWrap.removeEventListener("mousemove", onArrowMouseMove);
    document.removeEventListener("keydown", onArrowKeyDown);
    canvasEl?.querySelectorAll(".node").forEach(el => {
      el.classList.remove("arrow-source", "arrow-target-hover");
    });
    clearArrowPreview();
    if (activeArrowHintEl) activeArrowHintEl.style.display = "none";
  }

  function cancelArrowDraw() {
    const fromId = state.arrowFrom;
    clearArrowDrawState();
    logOp("CANCEL_ARROW", { fromId });
  }

  function renderArrowPreview() {
    const previewId = "arrowPreview" + activeMarkerSuffix;
    const prevMarkerId = "prev-arrow" + activeMarkerSuffix;
    let previewSvg = $(previewId);
    if (!previewSvg) {
      previewSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      previewSvg.id = previewId;
      previewSvg.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;overflow:visible;");
      previewSvg.innerHTML = `<defs>
        <marker id="${prevMarkerId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffd166" opacity="0.8"/>
        </marker></defs>`;
      canvasWrap.appendChild(previewSvg);
    }

    // clear old lines
    Array.from(previewSvg.querySelectorAll("line")).forEach(l => l.remove());

    const fromNode = state.nodes.find(n => n.id === state.arrowFrom);
    if (!fromNode) return;

    const a = nodeCenter(fromNode);
    const b = state.previewEnd;

    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
    const ex = b.x - (dx/dist)*14;
    const ey = b.y - (dy/dist)*14;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
    line.setAttribute("x2", ex);  line.setAttribute("y2", ey);
    line.setAttribute("stroke", "#ffd166");
    line.setAttribute("stroke-width", "2.5");
    line.setAttribute("stroke-dasharray", "8 4");
    line.setAttribute("marker-end", `url(#prev-arrow${activeMarkerSuffix})`);
    line.setAttribute("opacity", "0.75");
    previewSvg.appendChild(line);
  }

  function clearArrowPreview() {
    const p = $("arrowPreview" + activeMarkerSuffix);
    if (p) p.querySelectorAll("line").forEach(l => l.remove());
  }

  // ================================================================
  // EDGE LABEL POPUP
  // ================================================================
  // ================================================================
  // EDGE LABEL POPUP  ― 3種類 ＋ 方向選択
  // ================================================================
  function showEdgeLabelPopup(fromId, toId, clientX, clientY) {
    document.querySelectorAll(".edge-label-popup").forEach(p => p.remove());

    const popup = document.createElement("div");
    popup.className = "edge-label-popup";
    popup.style.left = Math.min(clientX, window.innerWidth - 310) + "px";
    popup.style.top  = Math.min(clientY, window.innerHeight - 220) + "px";

    const fromNode = state.nodes.find(n => n.id === fromId);
    const toNode   = state.nodes.find(n => n.id === toId);
    const fLbl = fromNode?.label || "A";
    const tLbl = toNode?.label   || "B";

    // 方向はドラッグで確定済み。ラベル種類のみ選択させる
    const rowsHtml = EDGE_TYPES.map(t => {
      const dot = `<span class="ebdot" style="background:${t.stroke}"></span>`;
      return `
        <button class="edge-dir-btn edge-create-type-btn" data-label="${esc(t.label)}"
          style="width:100%;border-color:${t.stroke}">
          <span class="dir-txt" style="color:${t.stroke}">${dot} ${esc(t.label)}</span>
          <span class="dir-sub">${esc(t.desc)}</span>
        </button>`;
    }).join("");

    popup.innerHTML = `
      <div class="popup-title">矢印の種類を選択</div>
      <div class="popup-nodes">
        <span class="popup-node-chip from">${esc(fLbl)}</span>
        <span class="popup-node-arr">→</span>
        <span class="popup-node-chip to">${esc(tLbl)}</span>
      </div>
      <div class="popup-types" style="gap:6px">${rowsHtml}</div>
      <button class="popup-cancel">キャンセル</button>
    `;

    document.body.appendChild(popup);

    popup.querySelectorAll(".edge-create-type-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        addEdgeWithLabel(fromId, toId, btn.dataset.label);
        popup.remove();
      });
    });
    popup.querySelector(".popup-cancel").addEventListener("click", () => popup.remove());

    setTimeout(() => {
      document.addEventListener("click", function closePopup(e) {
        if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener("click", closePopup); }
      });
    }, 100);
  }

  function addEdgeWithLabel(fromId, toId, label) {
    const check = canAddEdge(fromId, toId, label, state.edges);
    if (!check.allowed) {
      showToast(check.reason);
      logOp("VALIDATION_ERROR", { type: "EDGE_ADD_DENIED", fromId, toId, label, reason: check.reason });
      return;
    }
    const id    = "e-" + uid();
    const type  = EDGE_MAP[label] || EDGE_TYPES[0];
    const bidir = !!type.bidirectional;
    state.edges.push({ id, from: fromId, to: toId, label, bidirectional: bidir });
    const fromN = state.nodes.find(n => n.id === fromId);
    const toN   = state.nodes.find(n => n.id === toId);
    logOp("ADD_EDGE", { id, fromId, toId, fromLabel: fromN?.label, toLabel: toN?.label, label, bidirectional: bidir });
    renderAll();
    saveToLocalStorage();
    maybeRerenderAnswerStageAfterEdit(); // [adaptive_v1] エッジ追加確定時
  }

  // ================================================================
  // EDGE RENDER (SVG)
  // ================================================================
  function nodeCenter(n) {
    const el = getNodeEl(n.id);
    if (!el) return { x: n.x + 75, y: n.y + 28 };
    const r  = el.getBoundingClientRect();
    const cr = canvasWrap.getBoundingClientRect();
    return { x: r.left - cr.left + r.width/2, y: r.top - cr.top + r.height/2 };
  }

  function renderEdges() {
    const defs = svgEl.querySelector("defs");
    svgEl.innerHTML = "";
    if (defs) svgEl.appendChild(defs);
    const isP5 = !!(MAP_PHASE_CONFIG[state.phase]?.isReadOnly);
    // Phase 11（最終確認のみ）はエッジの選択・削除を不可にする（表示専用）
    const isViewOnlyEdges = isP5 || state.phase === PHASE.ACUTE_REVISE;

    const CURVE_OFFSET  = 50;
    const SAME_DIR_STEP = 22; // 同方向グループ内の間隔（px）

    for (const e of state.edges) {
      const from = state.nodes.find(n => n.id === e.from);
      const to   = state.nodes.find(n => n.id === e.to);
      if (!from || !to) continue;

      const a = nodeCenter(from);
      const b = nodeCenter(to);
      const typeInfo = EDGE_MAP[e.label] || EDGE_TYPES[0];
      const col = typeInfo.stroke;

      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const shorten = 26;

      // 逆向きペアが存在するか確認（自身を除く）
      const hasReverse = state.edges.some(r =>
        r.id !== e.id && r.from === e.to && r.to === e.from
      );

      // 同方向グループ（同一 from/to）を ID でソートして安定インデックスを取得
      const sameDirEdges = state.edges
        .filter(x => x.from === e.from && x.to === e.to)
        .sort((p, q) => p.id < q.id ? -1 : 1);
      const sameDirIndex  = sameDirEdges.findIndex(x => x.id === e.id);
      const sameDirCount  = sameDirEdges.length;
      const sameDirOffset = (sameDirIndex - (sameDirCount - 1) / 2) * SAME_DIR_STEP;

      // 正規方向（ID小→大）で法線を統一（hasReverse の有無に関わらず常に算出）
      const sign = e.from < e.to ? 1 : -1;
      const [canonFrom, canonTo] = e.from < e.to ? [from, to] : [to, from];
      const ca = nodeCenter(canonFrom), cb = nodeCenter(canonTo);
      const cdx = cb.x - ca.x, cdy = cb.y - ca.y;
      const cdist = Math.sqrt(cdx*cdx + cdy*cdy) || 1;
      const cnx = -cdy / cdist, cny = cdx / cdist;

      // 開始・終了点（ノード端から shorten px 引く）
      const sx = a.x + (dx/dist)*shorten;
      const sy = a.y + (dy/dist)*shorten;
      const ex = b.x - (dx/dist)*shorten;
      const ey = b.y - (dy/dist)*shorten;

      let pathD, lx, ly;

      if (e.bidirectional) {
        // 双方向（連携協力）: 両端に矢印を持つ直線（変更なし）
        const bsx = a.x + (dx / dist) * shorten;
        const bsy = a.y + (dy / dist) * shorten;
        pathD = `M ${bsx} ${bsy} L ${ex} ${ey}`;
        lx = (a.x + b.x) / 2;
        ly = (a.y + b.y) / 2;
      } else {
        // 指示命令・情報伝達・支援: 複合オフセットによる二次ベジェ
        // totalOffset=0 のとき制御点が中点 → 直線と等価
        const reverseOffset = hasReverse ? sign * CURVE_OFFSET : 0;
        const totalOffset   = reverseOffset + sameDirOffset;
        const cpx = (sx + ex) / 2 + totalOffset * cnx;
        const cpy = (sy + ey) / 2 + totalOffset * cny;
        pathD = `M ${sx} ${sy} Q ${cpx} ${cpy} ${ex} ${ey}`;
        lx = (sx + 2 * cpx + ex) / 4;
        ly = (sy + 2 * cpy + ey) / 4;
      }

      const isSelected = e.id === state.selectedEdgeId;
      const markerKey = col === "#ff6b6b" ? "red" : col === "#4d8fff" ? "blue" : col === "#c084fc" ? "purple" : "teal";
      const markerEnd   = `url(#arrow-${markerKey}${activeMarkerSuffix})`;
      const markerStart = e.bidirectional ? `url(#arrow-${markerKey}${activeMarkerSuffix})` : "none";

      // <g> ラッパー（ハイライト用 data 属性付き）
      const edgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      edgeGroup.dataset.from   = e.from;
      edgeGroup.dataset.to     = e.to;
      edgeGroup.dataset.edgeId = e.id;
      svgEl.appendChild(edgeGroup);

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      path.setAttribute("stroke", isSelected ? "#fbbf24" : col);
      path.setAttribute("stroke-width", isSelected ? "3.5" : "2.2");
      path.setAttribute("fill", "none");
      path.setAttribute("marker-end", markerEnd);
      if (e.bidirectional) path.setAttribute("marker-start", markerStart);
      path.setAttribute("opacity", isSelected ? "1" : isP5 ? "0.4" : "0.88");
      edgeGroup.appendChild(path);

      // label pill
      const labelW = (e.label?.length || 0) * 8 + 12;
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("x", lx - labelW/2); bg.setAttribute("y", ly - 11);
      bg.setAttribute("width", labelW); bg.setAttribute("height", 16);
      bg.setAttribute("rx", 5); bg.setAttribute("fill", "#0d1422"); bg.setAttribute("opacity", "0.9");
      edgeGroup.appendChild(bg);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", lx); text.setAttribute("y", ly - 2);
      text.setAttribute("class", "edge-label-text");
      text.setAttribute("fill", isSelected ? "#fbbf24" : col);
      text.textContent = e.label || "";
      edgeGroup.appendChild(text);

      // 選択中エッジに × 削除ボタンを中点に表示
      if (isSelected) {
        const delCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        delCircle.setAttribute("cx", lx);
        delCircle.setAttribute("cy", ly + 14);
        delCircle.setAttribute("r", "10");
        delCircle.setAttribute("fill", "#ef4444");
        delCircle.setAttribute("cursor", "pointer");
        delCircle.setAttribute("pointer-events", "all");
        delCircle.addEventListener("click", ev => { ev.stopPropagation(); deleteEdge(e.id); });
        edgeGroup.appendChild(delCircle);

        const delText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        delText.setAttribute("x", lx);
        delText.setAttribute("y", ly + 14);
        delText.setAttribute("text-anchor", "middle");
        delText.setAttribute("dominant-baseline", "central");
        delText.setAttribute("fill", "#fff");
        delText.setAttribute("font-size", "13");
        delText.setAttribute("font-weight", "900");
        delText.setAttribute("pointer-events", "none");
        delText.textContent = "×";
        edgeGroup.appendChild(delText);
      }

      // クリック用透明ヒットエリア（選択済み or 読み取り専用フェーズ・表示専用フェーズでは追加しない）
      if (!isSelected && !isViewOnlyEdges) {
        const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "path");
        hitArea.setAttribute("d", pathD);
        hitArea.setAttribute("stroke", "transparent");
        hitArea.setAttribute("stroke-width", "14");
        hitArea.setAttribute("fill", "none");
        hitArea.setAttribute("cursor", "pointer");
        hitArea.setAttribute("pointer-events", "all");
        hitArea.dataset.edgeId = e.id;
        hitArea.addEventListener("click", ev => {
          ev.stopPropagation();
          selectEdge(e.id);
        });
        edgeGroup.appendChild(hitArea);
      }
    }
  }

  // ================================================================
  // SELECTORS & Q1
  // ================================================================
  function updateSelectors() {
    updateQ1Select();
  }

  function updateQ1Select() {
    const sel = $("q1Answer");
    if (!sel) return;
    const prev = state.answers.q1;
    sel.innerHTML = `<option value="">（ノードを選択）</option>` +
      state.nodes.map(n => `<option value="${n.id}" ${n.id===prev?"selected":""}>${esc(n.label)}</option>`).join("");
  }

  // ================================================================
  // EDGE SELECTION / DELETION
  // ================================================================
  function selectEdge(id) {
    state.selectedEdgeId = id;
    state.selectedNodeId = null;
    document.querySelectorAll(".node").forEach(el => el.classList.remove("selected"));
    document.querySelectorAll(".node-delete-btn").forEach(b => b.style.display = "none");
    renderEdges();
  }

  function deleteEdge(id) {
    const e = state.edges.find(x => x.id === id);
    if (!e) return;
    const fromN = state.nodes.find(n => n.id === e.from);
    const toN   = state.nodes.find(n => n.id === e.to);
    if (!confirm(`「${fromN?.label} → ${toN?.label}」の矢印を削除しますか？`)) return;
    logOp("DELETE_EDGE", { id, fromId: e.from, toId: e.to, fromLabel: fromN?.label, toLabel: toN?.label, label: e.label });
    state.edges = state.edges.filter(x => x.id !== id);
    state.selectedEdgeId = null;
    renderAll();
    saveToLocalStorage();
    maybeRerenderAnswerStageAfterEdit(); // [adaptive_v1] エッジ削除確定時
  }

  // ================================================================
  // AUTO LAYOUT
  // ================================================================
  // ================================================================
  // CANVAS STAT
  // ================================================================
  function updateCanvasStat() {
    if (activeCanvasStatEl) activeCanvasStatEl.textContent = `ノード: ${state.nodes.length} ／ 矢印: ${state.edges.length}`;
  }

  // ================================================================
  // JSON / EXPORT
  // ================================================================
  function buildExportObject() {
    // 現フェーズの状態を一時保存（読み取り専用フェーズは保存不要）
    if (activePhaseKey && !MAP_PHASE_CONFIG[state.phase]?.isReadOnly)
      savePhaseData(activePhaseKey);
    return {
      version: 9,
      logSchemaVersion: 1,
      sessionId: state.sessionId,
      exportedAt: new Date().toISOString(),
      scenarioId: SCENARIO.id,
      flowVersion: FLOW_VERSION, // [ADDED flow-v2]
      contentVersions: {
        scenario:      CONTENT_VERSIONS.scenario,
        idealMapAcute: window.idealMapAcute?.mapVersion ?? null,
        hintTexts:     HINT_TEXTS_VERSION, // [ADDED] ヒント文面の版識別
        scoringRule:   window.__ICS_SCORING__?.version ?? null, // [ADDED axis4] 採点規則の版識別
      },
      acuteSubPhase:  state.acuteSubPhase,
      tooltipEnabled: state.tooltipEnabled,
      operationLog: state.operationLog,
      acute: {
        nodes:   phaseData.acute.nodes,
        edges:   phaseData.acute.edges,
        answers: phaseData.acute.answers,
      },
      recovery: {
        nodes:   phaseData.p6.nodes,
        edges:   phaseData.p6.edges,
        answers: phaseData.p6.answers,
      },
      phase5Data:        window.phase5Data        || {},
      acuteRecord:       phaseData.acuteRecord,
      acuteLayerBaseline: phaseData.acuteLayerBaseline || null,  // [NEW]
      acuteBaseline:     phaseData.acuteBaseline  || null,  // [NEW]
      acuteRevised:      phaseData.acuteRevised   || null,  // [NEW]
      transitionCompare: phaseData.transitionCompare,
      recoveryCompare:   phaseData.recoveryCompare,
      recoveryRecord:    phaseData.recoveryRecord,
    };
  }

  function exportJSON() {
    logOp("EXPORT", {
      currentPhase: state.phase,
      currentPhaseName: getPhaseName(state.phase),
      operationLogCount: state.operationLog.length
    });
    const blob = new Blob([JSON.stringify(buildExportObject(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ics_log_${SCENARIO.id}_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function validateEdgeConflicts(edges) {
    const _cmdInfoSet = new Set(["指示命令", "情報伝達"]);
    return edges.some(e1 =>
      e1.label === "連携協力" &&
      edges.some(e2 =>
        e2.id !== e1.id && _cmdInfoSet.has(e2.label) &&
        ((e2.from === e1.from && e2.to === e1.to) ||
         (e2.from === e1.to   && e2.to === e1.from))
      )
    );
  }

  function normalizeLegacyLogEntry(entry) {
    return {
      ts:             entry.ts             || null,
      sessionId:      entry.sessionId      || null,
      phase:          entry.phase          ?? null,
      phaseName:      entry.phaseName      || null,
      activePhaseKey: entry.activePhaseKey || null,
      type:           entry.type,
      detail:         entry.detail         || {}
    };
  }

  function migrateLegacyLogs(obj) {
    if (Array.isArray(obj.operationLog)) {
      return obj.operationLog;  // v8+
    }
    const merged = [
      ...((obj.acute    && obj.acute.operationLog)    || []),
      ...((obj.recovery && obj.recovery.operationLog) || [])
    ];
    merged.sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));
    return merged.map(normalizeLegacyLogEntry);
  }

  function importJSON() {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json";
    inp.onchange = () => {
      const file = inp.files?.[0];
      if (!file) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const obj = JSON.parse(fr.result);
          let hasConflict = false;
          const importedLogs = migrateLegacyLogs(obj);
          const oldSessionId = obj.sessionId || null;

          if ((obj.version === 9 || obj.version === 8 || obj.version === 7 || obj.version === 6 || obj.version === 5 || obj.version === 4 || obj.version === 3) && obj.acute && obj.recovery) { // v9/v8/v7/v6/v5/v4/v3
            // v3/v4: 全フェーズを復元
            const loadPhase = (src) => ({
              nodes: (src.nodes || []).map(n => ({ layerId: null, layerReason: "", isInitial: false, ...n })),
              edges: src.edges || [],
              answers: { q1: "", q2: "", p3q1: "", p3q2: "", p3q2sel: "", ...(src.answers || {}) },
              log: src.operationLog || [],
              selectedNodeId: null, selectedEdgeId: null,
            });
            phaseData.acute    = loadPhase(obj.acute);
            phaseData.recovery = loadPhase(obj.recovery);
            // acuteRecord の復元
            phaseData.acuteRecord = {
              answers: {
                q4: obj.acuteRecord?.answers?.q4 || "",
                q5: obj.acuteRecord?.answers?.q5 || "",
              }
            };
            // recoveryCompare の復元（v4/v5 に存在、v3 は空で補完）
            phaseData.recoveryCompare = {
              answers: {
                q6:    obj.recoveryCompare?.answers?.q6    || "",
                q7:    obj.recoveryCompare?.answers?.q7    || "",
                q7sel: obj.recoveryCompare?.answers?.q7sel || "",
              }
            };
            // recoveryRecord の復元（v5 に存在、v3/v4 は空で補完）
            phaseData.recoveryRecord = {
              answers: {
                q9: obj.recoveryRecord?.answers?.q9 || "",
              }
            };
            // transitionCompare の復元（v7 に存在、v6 以前は空で補完）
            phaseData.transitionCompare = {
              answers: {
                q6: obj.transitionCompare?.answers?.q6 || "",
              }
            };
            // acuteLayerBaseline / acuteBaseline / acuteRevised の復元（旧バージョンは null で補完）
            phaseData.acuteLayerBaseline = obj.acuteLayerBaseline || null;
            phaseData.acuteBaseline = obj.acuteBaseline || null;
            phaseData.acuteRevised  = obj.acuteRevised  || null;
            // phase5Data の復元（同一ラベルのノードを補完）
            if (obj.phase5Data?.removals) {
              const restoredRemovals = [];
              const seenLabels = new Set();
              for (const r of obj.phase5Data.removals) {
                if (seenLabels.has(r.label)) continue;
                seenLabels.add(r.label);
                const sameLabel = (window.idealMapAcute?.nodes || []).filter(n => n.label === r.label);
                if (sameLabel.length > 0) {
                  sameLabel.forEach(n => {
                    restoredRemovals.push({ nodeId: n.id, label: n.label, reason: r.reason || "" });
                  });
                } else {
                  // idealMapAcute未ロードの場合は元のエントリをそのまま保持
                  restoredRemovals.push(r);
                }
              }
              window.phase5Data = {
                removals: restoredRemovals,
                policyRationale: obj.phase5Data?.policyRationale || ""  // [ADDED] v5 以前は空文字で補完
              };
            }
            // recovery → phaseData.p6 に復元（Phase6 の正規データ）
            phaseData.p6 = loadPhase(obj.recovery);
            phase6Initialized = phaseData.p6.nodes.length > 0;
            if (phase6Initialized) {
              // インポートした p6 データを有効とみなす。
              // この時点で phase5Data の復元も完了しているため、
              // getRemovalSignature() でシグネチャを記録しておくことで、
              // Phase6 入場時に p6NeedsRebuild()=false となり不要な再構築を防ぐ。
              phase6RemovalSignature = getRemovalSignature();
            }
            if (validateEdgeConflicts(phaseData.acute.edges) ||
                validateEdgeConflicts(phaseData.recovery.edges)) hasConflict = true;
          } else if (obj.version === 2 && obj.acute && obj.recovery) { // v2 後方互換
            const loadPhaseV2 = (src) => ({
              nodes: (src.nodes || []).map(n => ({ layerId: null, layerReason: "", isInitial: false, ...n })),
              edges: src.edges || [],
              answers: { q1: "", q2: "", p3q1: "", p3q2: "", p3q2sel: "", ...(src.answers || {}) },
              log: src.operationLog || [],
              selectedNodeId: null, selectedEdgeId: null,
            });
            phaseData.acute    = loadPhaseV2(obj.acute);
            phaseData.recovery = loadPhaseV2(obj.recovery);
            // v2 には acuteRecord / recoveryCompare / recoveryRecord / transitionCompare がないため空で補完
            phaseData.acuteRecord       = { answers: { q4: "", q5: "" } };
            phaseData.transitionCompare = { answers: { q6: "" } };
            phaseData.recoveryCompare   = { answers: { q6: "", q7: "", q7sel: "" } };
            phaseData.recoveryRecord    = { answers: { q9: "" } };
            if (obj.phase5Data?.removals) {
              const restoredRemovals = [];
              const seenLabels = new Set();
              for (const r of obj.phase5Data.removals) {
                if (seenLabels.has(r.label)) continue;
                seenLabels.add(r.label);
                const sameLabel = (window.idealMapAcute?.nodes || []).filter(n => n.label === r.label);
                if (sameLabel.length > 0) {
                  sameLabel.forEach(n => {
                    restoredRemovals.push({ nodeId: n.id, label: n.label, reason: r.reason || "" });
                  });
                } else {
                  restoredRemovals.push(r);
                }
              }
              window.phase5Data = {
                removals: restoredRemovals,
                policyRationale: obj.phase5Data?.policyRationale || ""  // [ADDED] v2 は空文字で補完
              };
            }
            phaseData.p6 = loadPhaseV2(obj.recovery);
            phase6Initialized = phaseData.p6.nodes.length > 0;
            if (phase6Initialized) {
              phase6RemovalSignature = getRemovalSignature();
            }
            if (validateEdgeConflicts(phaseData.acute.edges) ||
                validateEdgeConflicts(phaseData.recovery.edges)) hasConflict = true;
          } else if (Array.isArray(obj.nodes) && Array.isArray(obj.edges)) {
            // v1 legacy: 急性期に読み込む
            phaseData.acute = {
              nodes: obj.nodes.map(n => ({
                layerId: null, layerReason: "",
                isInitial: (n.label === "避難所" || n.label === "医療機関"),
                ...n
              })),
              edges: obj.edges,
              answers: { q1: "", q2: "", p3q1: "", p3q2: "", ...(obj.answers || {}) },
              log: obj.operationLog || [],
              selectedNodeId: null, selectedEdgeId: null,
            };
            // v1 には acuteRecord / recoveryCompare / recoveryRecord / transitionCompare がないため空で補完
            phaseData.acuteRecord       = { answers: { q4: "", q5: "" } };
            phaseData.transitionCompare = { answers: { q6: "" } };
            phaseData.recoveryCompare   = { answers: { q6: "", q7: "", q7sel: "" } };
            phaseData.recoveryRecord    = { answers: { q9: "" } };
            if (validateEdgeConflicts(phaseData.acute.edges)) hasConflict = true;
          } else {
            throw new Error();
          }

          if (hasConflict) showToast("読み込んだデータに矛盾する矢印の組み合わせが含まれています", 3000);
          state.sessionId      = generateSessionId();
          state.operationLog   = importedLogs;
          state.phaseStartTime = Date.now();
          // acuteSubPhase の復元 [FIX import-clobber]
          // buildExportObject() は acuteSubPhase を出力しているが従来未復元だった
          // （常に null → Phase 1 入場時に L1_COMMAND へリセットされ、
          //  チュートリアルバーとパレットのゲーティングが実態とずれる）。
          // ACUTE_SUB の正当な値のみ受け入れ、それ以外は null（従来動作）に落とす。
          const _validSubs = new Set(Object.values(ACUTE_SUB));
          state.acuteSubPhase = _validSubs.has(obj.acuteSubPhase) ? obj.acuteSubPhase : null;
          logOp("IMPORT", {
            importedVersion:   obj.version || null,
            importedSessionId: oldSessionId,
            importedLogCount:  importedLogs.length,
            hasAcute:          !!obj.acute,
            hasRecovery:       !!obj.recovery,
            hasConflict,
            restoredAcuteSubPhase: state.acuteSubPhase,
          });
          saveToLocalStorage();
          // 急性期フェーズに切り替えて表示
          // ── インポート結果の上書き防止ガード ── [FIX import-clobber]
          // switchPhase() 冒頭は、切替前フェーズがマップ編集系
          // （MAP_PHASE_CONFIG に存在し isReadOnly でない）の場合、
          // savePhaseData(activePhaseKey) が phaseData[activePhaseKey] を
          // 「切替前キャンバスの state.nodes/edges」で丸ごと上書きする。
          // インポート直後にこれが走ると、復元済みの
          //   Phase 13/14 → phaseData.acute / Phase 5 → phaseData.p6 /
          //   Phase 11    → phaseData.acuteRevised
          // が旧キャンバス内容で潰される。対策として、潰される対象キーの
          // インポート済み値（null を含む）を退避し、switchPhase 後に書き戻す。
          // ※ 旧 _importedRecovery 退避は phaseData.recovery を守っていたが、
          //    savePhaseData は recovery キーに書き込まないため実効性がなかった。
          if (state.phase !== PHASE.ACUTE_MAP) {
            const _clobberKey = (MAP_PHASE_CONFIG[state.phase] &&
                                 !MAP_PHASE_CONFIG[state.phase].isReadOnly)
                                ? activePhaseKey : null;
            const _importedSnap = _clobberKey ? phaseData[_clobberKey] : undefined;
            switchPhase(PHASE.ACUTE_MAP);
            if (_clobberKey) {
              phaseData[_clobberKey] = _importedSnap;  // null もそのまま書き戻す
              if (_clobberKey === "acute") {
                // Phase 13/14 発の場合、switchPhase 内の loadPhaseData("acute") は
                // 上書き後の旧データを読み込んで描画済みのため、
                // 書き戻し後に state を再同期して再描画する。
                loadPhaseData("acute");
                renderPalette();
                renderAll();
              }
              logOp("IMPORT_CLOBBER_GUARD", { restoredKey: _clobberKey,
                                              wasNull: _importedSnap == null });
              saveToLocalStorage();
            }
          } else {
            loadPhaseData("acute");
            if ($("q2Answer")) $("q2Answer").value = state.answers.q2 || "";
            const cc = $("charCount"); if (cc) cc.textContent = (state.answers.q2 || "").length;
            renderAll();
            setAcuteSubPhase(state.acuteSubPhase || ACUTE_SUB.L1_COMMAND, false);
          }
        } catch { alert("JSON形式が不正です。"); }
      };
      fr.readAsText(file);
    };
    inp.click();
  }

  function resetAll() {
    if (state.phase === PHASE.ORIENTATION) {
      showToast("オリエンテーション中は初期化できません", 2000);
      return;
    }
    // フェーズ13/14はレイヤー確定済みの本番データを直接編集しているため初期化を封鎖する [NEW]
    if (state.phase === PHASE.ACUTE_LAYER_REVISE || state.phase === PHASE.ACUTE_EDGE_MAP) {
      showToast("この段階では初期化できません。修正はドラッグ操作で行ってください", 2500);
      logOp("RESET_BLOCKED", { phase: state.phase });
      return;
    }
    // 対応検証記録：問3・問4 の回答をクリア
    if (state.phase === PHASE.ACUTE_RECORD) {
      if (!confirm("問3・問4 の回答をリセットしますか？")) return;
      phaseData.acuteRecord.answers = { q4: "", q5: "" };
      logOp("RESET", { target: "acuteRecordAnswers" });
      renderAcuteRecordView();   // フォームを再描画してリセット状態に戻す
      return;
    }
    // 急性期・復旧期構造比較：問5 の回答をクリア [NEW]
    if (state.phase === PHASE.TRANSITION_COMPARE) {
      if (!confirm("構造比較の回答をリセットしますか？")) return;
      phaseData.transitionCompare.answers = { q6: "" };
      const ta = $("tcQ6Answer"); if (ta) ta.value = "";
      const cc = $("tcQ6CharCount"); if (cc) cc.textContent = "0";
      logOp("RESET", { target: "transitionCompareAnswers" });
      return;
    }
    // 復旧期比較・分析：問6・問7 の回答をクリア
    if (state.phase === PHASE.RECOVERY_COMPARE) {
      if (!confirm("復旧期比較・分析の回答をリセットしますか？")) return;
      phaseData.recoveryCompare.answers = { q6: "", q7: "", q7sel: "" };
      const q6el = $("rcQ6Answer");
      const q7el = $("rcQ7Answer");
      if (q6el) { q6el.value = ""; const cc = $("rcQ6CharCount"); if (cc) cc.textContent = "0"; }
      if (q7el) { q7el.value = ""; const cc = $("rcQ7CharCount"); if (cc) cc.textContent = "0"; }
      document.querySelectorAll('input[name="rcQ7principle"]').forEach(r => { r.checked = false; });
      logOp("RESET", { target: "recoveryCompareAnswers" });
      return;
    }
    // 復旧期対応検証記録：問8 の回答をクリア
    if (state.phase === PHASE.RECOVERY_RECORD) {
      if (!confirm("問8 の回答をリセットしますか？")) return;
      phaseData.recoveryRecord.answers = { q9: "" };
      logOp("RESET", { target: "recoveryRecordAnswers" });
      renderRecoveryRecordView();
      return;
    }
    // 復旧期準備：削除候補リストのみクリア
    if (state.phase === PHASE.RECOVERY_PREP) {
      if (!confirm("削除候補の選択をすべてリセットしますか？")) return;
      window.phase5Data.removals = [];
      window.phase5Data.policyRationale = "";  // [ADDED]
      invalidatePhase6();
      logOp("RESET", { target: "phase5Removals" });
      renderPhase5Map();
      return;
    }
    // 復旧期マップ：ノード・矢印のみクリア（再初期化を許可）
    if (state.phase === PHASE.RECOVERY_MAP) {
      if (!confirm("リセットしますか？（復旧期マップのノード・矢印・ログを消します）")) return;
      state.nodes = []; state.edges = [];
      state.answers = { q1: "", q2: "" }; state.log = [];
      state.selectedNodeId = null; state.selectedEdgeId = null;
      // Phase6 を無効化: 次回入場時に initPhase6Canvas() が再実行される
      invalidatePhase6();
      clearArrowDrawState();
      logOp("RESET", { target: "recoveryMap" });
      renderAll();
      return;
    }
    const phaseLabel = state.phase === PHASE.RECOVERY_MAP ? "復旧期" : "急性期";
    if (!confirm(`初期化しますか？（${phaseLabel}のノード・矢印・回答・ログが消えます）`)) return;
    state.nodes = []; state.edges = [];
    state.answers = { q1: "", q2: "" }; state.log = [];
    state.selectedNodeId = null; state.selectedEdgeId = null;
    clearArrowDrawState();
    if ($("q2Answer")) $("q2Answer").value = "";
    const cc = $("charCount"); if (cc) cc.textContent = "0";
    logOp("RESET", { target: "activeMap", phaseKey: activePhaseKey });
    renderAll();
  }

  // ================================================================
  // SCORING (reserved for future implementation)
  // ================================================================

  // ================================================================
  // READ-ONLY MAP RENDERER
  // ═══════════════════════════════════════════════════════════════
  // 急性期マップ採点（scoring.js への配線）
  // Phase 2 遷移時に1回呼ばれる。結果を state.acuteScore に保持し、
  // logOp で記録する。表示は行わない（実装②で扱う）。
  // ═══════════════════════════════════════════════════════════════
  function gradeAcutePhase() {
    if (!window.__ICS_SCORING__) {
      console.warn("[grading] scoring.js 未読み込み。採点をスキップします。");
      logOp("GRADING_SKIPPED", { reason: "scoring_not_loaded", phase: "acute" });
      return null;
    }
    if (mapLoadStatus.idealAcute !== "ready" || !window.idealMapAcute) {
      console.warn("[grading] 規範マップ未ロード。採点をスキップします。");
      logOp("GRADING_SKIPPED", { reason: "ideal_map_not_ready", phase: "acute" });
      return null;
    }

    const { normalizeMap, gradeAcuteMap } = window.__ICS_SCORING__;

    try {
      const learnerRaw = {
        nodes: phaseData.acute.nodes,
        edges: phaseData.acute.edges,
      };
      const learnerNorm = normalizeMap(learnerRaw);
      const idealNorm   = normalizeMap(window.idealMapAcute);
      const result      = gradeAcuteMap(learnerNorm, idealNorm);

      state.acuteScore = result;

      logOp("ACUTE_SCORED", {
        counts:    result.counts,
        subscores: result.subscores,
        meta:      result.meta,
        errors:    result.errors.map(e => ({ category: e.category, detail: e.detail })),
      });

      console.log("[grading] 採点結果", result);
      return result;
    } catch (err) {
      console.error("[grading] 採点に失敗しました:", err);
      logOp("GRADING_ERROR", { message: String(err && err.message || err) });
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 急性期レイヤー配置採点（ACUTE_LAYER_DIFF） [NEW]
  // ACUTE_LAYER_DIFF 入場のたびに毎回呼ばれる（既存採点結果のガードなし）。
  // この時点ではエッジが未付与のため command_missing / support_missing 等が
  // 全件検出されるが無意味なので使用せず、layer_mismatch のみを layerErrors として抽出する。
  // ═══════════════════════════════════════════════════════════════
  function gradeAcuteLayerPhase() {
    if (!window.__ICS_SCORING__) {
      console.warn("[grading] scoring.js 未読み込み。採点をスキップします。");
      logOp("GRADING_SKIPPED", { reason: "scoring_not_loaded", phase: "layer" });
      return null;
    }
    if (mapLoadStatus.idealAcute !== "ready" || !window.idealMapAcute) {
      console.warn("[grading] 規範マップ未ロード。採点をスキップします。");
      logOp("GRADING_SKIPPED", { reason: "ideal_map_not_ready", phase: "layer" });
      return null;
    }

    const { normalizeMap, gradeAcuteMap } = window.__ICS_SCORING__;

    try {
      const learnerRaw = {
        nodes: phaseData.acute.nodes,
        edges: phaseData.acute.edges,
      };
      const learnerNorm = normalizeMap(learnerRaw);
      const idealNorm   = normalizeMap(window.idealMapAcute);
      const result       = gradeAcuteMap(learnerNorm, idealNorm);
      const layerErrors  = result.errors.filter(e => e.category === "layer_mismatch");

      state.acuteLayerScore = { ...result, layerErrors };

      logOp("ACUTE_LAYER_SCORED", {
        layerMismatchCount: layerErrors.length,
        labels: layerErrors.map(e => e.detail.label),
        residuals: layerErrors.map(e => ({ label: e.detail.label, expected: e.detail.expected, got: e.detail.got })),
      });

      console.log("[grading] レイヤー採点結果", state.acuteLayerScore);
      return state.acuteLayerScore;
    } catch (err) {
      console.error("[grading] レイヤー採点に失敗しました:", err);
      logOp("GRADING_ERROR", { phase: "layer", message: String(err && err.message || err) });
      return null;
    }
  }

  // ================================================================
  // ACUTE_DIFF / ACUTE_REVISE — 差分提示・修正フェーズのヘルパー [NEW]
  // ================================================================

  // snapshotAcuteBaseline: phaseData.acute を一度だけ deep copy してベースラインに固定。
  // 二度目以降の呼び出しは無視（research data の不変性を保証）。
  function snapshotAcuteBaseline() {
    if (phaseData.acuteBaseline) return;
    phaseData.acuteBaseline = JSON.parse(JSON.stringify({
      nodes: phaseData.acute.nodes,
      edges: phaseData.acute.edges,
      savedAt: new Date().toISOString(),
    }));
    logOp("ACUTE_BASELINE_SNAPPED", {
      nodeCount: phaseData.acuteBaseline.nodes.length,
      edgeCount: phaseData.acuteBaseline.edges.length,
    });
    saveToLocalStorage();
  }

  // ensureAcuteRevisedInitialized: phaseData.acuteRevised を acuteBaseline から deep copy で
  // 一度だけ作成する。[CHANGED] 主呼び出しは Phase 10（ACUTE_DIFF）入場時（snapshotAcuteBaseline
  // 直後）。Phase 11（ACUTE_REVISE）でも同一ガードで呼ぶが、Phase 10 を経由済みなら二度目は何もしない
  // （冪等）。acuteBaseline が未凍結の状態で呼ばれることはない（呼び出し順序で保証）。
  function ensureAcuteRevisedInitialized() {
    if (phaseData.acuteRevised && phaseData.acuteRevised.nodes != null) return;
    phaseData.acuteRevised = JSON.parse(JSON.stringify({
      nodes: phaseData.acuteBaseline.nodes,
      edges: phaseData.acuteBaseline.edges,
      answers: phaseData.acute.answers,
      selectedNodeId: null,
      selectedEdgeId: null,
    }));
    logOp("ACUTE_REVISED_INIT", {
      nodeCount: phaseData.acuteRevised.nodes.length,
      edgeCount: phaseData.acuteRevised.edges.length,
    });
  }

  // snapshotAcuteLayerBaseline: レイヤー配置（1A）完了時点の phaseData.acute を
  // 一度だけ deep copy して凍結する。二度目以降の呼び出しは無視（測定データの不変性）。
  // 呼び出し順序の前提: gradeAcuteLayerPhase() 成功直後（layerMismatchCount を焼き込むため）。
  function snapshotAcuteLayerBaseline() {
    if (phaseData.acuteLayerBaseline) return;
    phaseData.acuteLayerBaseline = JSON.parse(JSON.stringify({
      nodes: phaseData.acute.nodes,
      edges: phaseData.acute.edges,   // 1A 時点では空配列のはずだが構造の一貫性のため保持
      layerMismatchCount: state.acuteLayerScore?.layerErrors?.length ?? null,
      savedAt: new Date().toISOString(),
    }));
    logOp("ACUTE_LAYER_BASELINE_SNAPPED", {
      nodeCount: phaseData.acuteLayerBaseline.nodes.length,
      layerMismatchCount: phaseData.acuteLayerBaseline.layerMismatchCount,
    });
    saveToLocalStorage();
  }

  // gradeRevisedPhase: state.nodes/edges（修正後の live 状態）を採点する。
  // ACUTE_REVISED_SCORED ログに before/after カウントを記録。
  function gradeRevisedPhase() {
    if (!window.__ICS_SCORING__) {
      console.warn("[grading] scoring.js 未読み込み。修正採点をスキップします。");
      logOp("GRADING_SKIPPED", { reason: "scoring_not_loaded", phase: "revised" });
      return null;
    }
    if (mapLoadStatus.idealAcute !== "ready" || !window.idealMapAcute) {
      console.warn("[grading] 規範マップ未ロード。修正採点をスキップします。");
      logOp("GRADING_SKIPPED", { reason: "ideal_map_not_ready", phase: "revised" });
      return null;
    }
    const { normalizeMap, gradeAcuteMap } = window.__ICS_SCORING__;
    try {
      const revisedRaw  = { nodes: state.nodes, edges: state.edges };
      const revisedNorm = normalizeMap(revisedRaw);
      const idealNorm   = normalizeMap(window.idealMapAcute);
      const result      = gradeAcuteMap(revisedNorm, idealNorm);
      state.acuteScoreRevised = result;
      logOp("ACUTE_REVISED_SCORED", {
        before:      state.acuteScore?.counts || null,
        after:       result.counts,
        subscores:   result.subscores,
        meta:        result.meta,
        source:      "walkthrough_exit", // [ADDED flow-v2] 発火位置がPhase10（bundleループ）退出に移設
        afterErrors: result.errors.map(e => ({ category: e.category, detail: e.detail })),
      });
      console.log("[grading] 修正後採点結果", result);
      return result;
    } catch (err) {
      console.error("[grading] 修正後採点に失敗:", err);
      logOp("GRADING_ERROR", { phase: "revised", message: String(err?.message || err) });
      return null;
    }
  }

  // [DEPRECATED flow-v2] showAcuteReviseSummary は削除。ロジックは walkthrough 完了画面
  // （renderBundleStage の index=N 分岐）に吸収された（修正プロンプト(b) 2-4）。

  // gradeAcuteLayerRevisedPhase: state.nodes/edges（フェーズ13 live 編集状態）を採点する。
  // ACUTE_LAYER_REVISED_SCORED ログに before（ベースライン時点の layerMismatchCount）/
  // after（現在の layerMismatchCount）を記録する。必ずスナップの前に呼ぶこと。
  function gradeAcuteLayerRevisedPhase() {
    if (!window.__ICS_SCORING__) {
      console.warn("[grading] scoring.js 未読み込み。レイヤー修正採点をスキップします。");
      logOp("GRADING_SKIPPED", { reason: "scoring_not_loaded", phase: "layer_revised" });
      return null;
    }
    if (mapLoadStatus.idealAcute !== "ready" || !window.idealMapAcute) {
      console.warn("[grading] 規範マップ未ロード。レイヤー修正採点をスキップします。");
      logOp("GRADING_SKIPPED", { reason: "ideal_map_not_ready", phase: "layer_revised" });
      return null;
    }
    const { normalizeMap, gradeAcuteMap } = window.__ICS_SCORING__;
    try {
      const revisedRaw  = { nodes: state.nodes, edges: state.edges };
      const revisedNorm = normalizeMap(revisedRaw);
      const idealNorm   = normalizeMap(window.idealMapAcute);
      const result      = gradeAcuteMap(revisedNorm, idealNorm);
      const layerErrors = result.errors.filter(e => e.category === "layer_mismatch");

      state.acuteLayerScoreRevised = { ...result, layerErrors };

      // [FIX layer-recording] residuals / layerAssignment を追加。
      // 本関数は必ずスナップ（snapAcuteLayersToIdeal）の前に呼ばれるため、
      // この時点の state.nodes は学習者の最終修正状態（スナップ前）である。
      // - residuals: 残存エラーごとの { label, expected, got }。
      //   got（学習者が実際に置いた層）は scoring.js の detail 由来。
      // - layerAssignment: 全ノードの label → layerId 対応表（スナップ前）。
      //   ラベルはパレット由来で一意（正解マップ側は dev-tools が重複を拒否）。
      // 既存フィールド（before / after / labels）は後方互換のため変更しない。
      logOp("ACUTE_LAYER_REVISED_SCORED", {
        before: phaseData.acuteLayerBaseline?.layerMismatchCount ?? null,
        after:  layerErrors.length,
        labels: layerErrors.map(e => e.detail.label),
        residuals: layerErrors.map(e => ({
          label:    e.detail.label,
          expected: e.detail.expected,
          got:      e.detail.got,
        })),
        layerAssignment: Object.fromEntries(
          state.nodes.map(n => [n.label, n.layerId ?? null])
        ),
        source: "walkthrough_exit", // [ADDED flow-v2] 発火位置がPhase12（bundleループ）退出に移設
      });
      console.log("[grading] レイヤー修正後採点結果", state.acuteLayerScoreRevised);
      return state.acuteLayerScoreRevised;
    } catch (err) {
      console.error("[grading] レイヤー修正後採点に失敗:", err);
      logOp("GRADING_ERROR", { phase: "layer_revised", message: String(err?.message || err) });
      return null;
    }
  }

  // snapAcuteLayersToIdeal: レイヤー修正で残った誤りを正解配置に強制確定する。
  // 全参加者が同一の正しい骨格の上でエッジ付与に入るための研究設計上の措置。
  // 必ずフェーズ13（canvasWrap = canvasWrap-revise が表示中）の間に呼ぶこと。
  // getCenterYForLayer() は canvasWrap の実高さに依存するため、
  // 非表示時に呼ぶとフォールバック値(600)基準の座標になりズレる。
  function snapAcuteLayersToIdeal(layerErrors) {
    const idealNodes = window.idealMapAcute?.nodes || [];
    const idealLayerByLabel = new Map(idealNodes.map(n => [n.label, n.layerId]));
    const snappedLabels = [];
    for (const err of layerErrors) {
      const label = err.detail.label;
      const node  = state.nodes.find(n => n.label === label);
      const idealLayerId = idealLayerByLabel.get(label);
      if (!node || idealLayerId == null) continue;
      node.layerId = idealLayerId;
      node.y = getCenterYForLayer(idealLayerId);   // x は学習者配置を維持
      snappedLabels.push(label);
    }
    logOp("ACUTE_LAYER_SNAPPED", {
      snappedLabels,
      residualCount: snappedLabels.length,
      source: "walkthrough_exit", // [ADDED flow-v2] 発火位置がPhase12（bundleループ）退出に移設
    });
    // [FIX layer-recording] スナップの明示化。
    // 無通知だと「勝手に配置が変わった」と受け取られ、Phase 14→13 の
    // 置き直しループを誘発する（2026-07-08 テストログで3周を確認）。
    // 正答フィードバックの提示として学習者に通知する。0件時は通知しない。
    if (snappedLabels.length > 0) {
      showToast(`残っていた${snappedLabels.length}件の配置は、正解の層に確定しました`, 3500);
    }
    return snappedLabels;
  }

  // buildLabelToIdMap: learnNodes 配列から label → id マップを作る。
  function buildLabelToIdMap(learnNodes) {
    const m = {};
    for (const n of learnNodes) m[n.label] = n.id;
    return m;
  }

  // ハブ: 連携協力エッジの中心になるノード（ideal_map から）
  const HUBS_FOR_DIFF = new Set(["C県A保健所", "地域災害医療コーディネーター", "市町村保健センター"]);

  // HINT_TEXTS: bundleループのヒントステージ用テキスト（カテゴリ単位）。正解は開示しない。
  // {from}/{to} 置換が必要なのは support_missing / support_overuse のみ。
  // hub_direct_supplement は独立カテゴリではなく、hub_misassignment のヒント本文に
  // 条件付き（correctHub === "C県A保健所"）で追記する継続テキスト。
  // HINT_TEXTS の文面を変更したら必ずこの版を上げること（測定条件の識別子。
  // mapVersion と同じ運用。文面変更と版バンプは同一コミットに含める）。
  // "ht-v1" は計装以前の旧文面を指す暗黙の版で、ログに ht-v1 が現れることはない
  // ——hintTextsVersion 欠落＝旧文面（ht-v1相当）、という判別になる。
  const HINT_TEXTS_VERSION = "ht-v5";

  const HINT_TEXTS = {
    support_missing:
      "シナリオ表1を参照してください。{from}の支援先がどこと書かれていたか、もう一度確認してください。",
    support_overuse:
      "シナリオ表1を参照してください。{from}が{to}を支援するという記述はありますか？ 確認してみましょう。",
    hub_misassignment:
      "シナリオの会議の場面を参照してください。各チームの活動状況は、誰かが集約して報告されていますか？ " +
      "A保健所がすべてのチームと直接つながると、同時に管理する相手が多くなりすぎます。",
    hub_direct_supplement:
      "ただし管轄で活動する地域の団体は事情が異なります。シナリオの該当する段落で、組織の種類がどう区別されているか確認してください。",
    command_missing:
      "凡例の『指示命令』は、同一の指揮系統の中だけで使います。この2つの組織は同じ指揮系統の中にありますか？ シナリオで、一方が他方の指示を受けて動いている場面を探してみましょう。",
    command_overuse:
      "「指示命令」は同一の指揮系統の中だけで使います。この2つは同じ組織の中の関係ですか？ " +
      "凡例の「指示命令」と「連携協力」の定義を見比べてみましょう。",
    edge_label_error:
      "矢印の種類は『誰が誰に何をするか』で決まります。この組み合わせは、一方がもう一方の活動を現場で支える関係ですか？ それとも別々の組織どうしの対等な協力ですか？ 凡例の定義と、シナリオでの両者のやり取りを見比べてください。",
    layer_mismatch:
      "ここに集まった組織には、シナリオ表1で展開した動きがあります。それぞれの「動き」の記述を見比べてみましょう。",
    coordination_path_error:
      "この2つの組織は、シナリオの中で直接やり取りしていますか？ " +
      "各チームの活動状況が誰を通じて集約・調整されていたか、会議の場面をもう一度確認してみましょう。",
    // [ADDED hint_dheat_v1] coordination_path_error の subtype=command_support_as_hub 専用ヒント。
    // 正解（層・接続・ラベル）は開示しない（問いのみの弱い足場）。lateral 用は既存キーを流用。
    coordination_path_error_dheat:
      "DHEATがシナリオの中でどのような目的で派遣されているか、派遣の場面をもう一度確認してみましょう。" +
      "DHEATは、各チームの活動状況を取りまとめる役割でしょうか？",
  };

  // bundleKeyOf: bundleループの束ね単位を返す。layer_mismatch のみ正解層（detail.expected）
  // 単位に細分化し、それ以外は category をそのまま束ねキーとする。
  // buildWalkthroughSteps（tagBundlesAndShortenWhy）と buildBundles / showBundleStep の
  // いずれからも参照するためモジュールスコープに置く。
  function bundleKeyOf(step) {
    if (step.category === "layer_mismatch") {
      const exp = step.error?.detail?.expected;
      return `layer_mismatch#${exp ?? "none"}`;
    }
    return step.category;
  }

  // buildWalkthroughSteps: errors 配列と idealNodes から表示用ステップ配列を生成する純粋関数。
  // DOM に触れない（後日単体テスト対象）。
  function buildWalkthroughSteps(errors, idealNodes) {
    const idealNodeMap = {};
    for (const n of idealNodes) idealNodeMap[n.label] = n;

    function layerName(id) {
      switch (id) {
        case 1: return "指揮の層";
        case 2: return "調整の層";
        case 3: return "実働の層";
        case 4: return "支援対象の層";
        default: return "層未設定";
      }
    }

    const CATEGORY_GROUP = {
      command_overuse:         "command",
      command_missing:         "command",
      edge_label_error:        "command",
      layer_mismatch:          "layer",
      hub_misassignment:       "hub",
      support_layer_violation: "support_origin",
      support_missing:         "support",
      support_overuse:         "support",
      coordination_path_error: "hub", // [ADDED axis4] グループ表示は既存の「連携先」を共用
    };
    const GROUP_ORDER = ["layer", "command", "hub", "support_origin", "support"];
    const GROUP_LABEL = {
      command:        "指示命令と連携協力の使い分け",
      layer:          "配置する層",
      hub:            "連携先（どのまとめ役につなぐか）",
      support_origin: "支援の出どころ",
      support:        "支援のつながり",
    };

    const WHY_CMD_OVERUSE =
      "指示命令は、同じ組織の中の上下関係でだけ使います。別々の組織どうしは、対等な連携協力で結びます。" +
      "この構造で指示命令が成り立つのは、県庁からC県A保健所へ、C県A保健所からDHEATへ、の2本だけです。";
    const WHY_EDGE_LABEL =
      "まとめ役と各組織は、上下関係ではなく対等な協力関係です。そのため、矢印は連携協力にします。";
    const WHY_HUB_OVERUSE =
      "それぞれの組織は、決まったまとめ役を通じてつながります。すべてを直接つなぐと情報の流れが混乱するため、" +
      "窓口を一本にまとめるのがICSの考え方です。";
    const WHY_SUPPORT_VIOLATION =
      "支援の矢印は、現場で活動するチーム（実働の層）から、支援を受ける側（支援対象の層）へ引きます。" +
      "指揮や調整の組織は直接支援するのではなく、チームを動かす側です。";
    const WHY_COORD_LATERAL =
      "組織どうしの調整は、決まったまとめ役を通して行います。" +
      "チームどうしを直接つなぐと連絡経路が増えすぎ、まとめ役が全体の状況を把握できなくなるため、" +
      "それぞれのまとめ役を経由してつながるのがICSの考え方です。";
    const WHY_COORD_DHEAT =
      "DHEATは、C県A保健所の指揮のもとで、保健所の指揮調整機能を応援するチームです。" +
      "各チームの窓口となるまとめ役ではないため、各チームとは直接つなぎません。";

    // カテゴリ表示順（groupKey 内の二次ソートキー）
    const CATEGORY_ORDER = [
      "layer_mismatch",
      "command_missing", "command_overuse", "edge_label_error",
      "hub_misassignment", "coordination_path_error",
      "support_layer_violation",
      "support_missing", "support_overuse",
    ];

    // bundleループの各カテゴリ単位・複数件時のインスタンス側短縮【なぜ】。★仮テキスト
    const WHY_SHORT = {
      command_overuse:         "別々の組織どうしなので、指示命令の関係にはなりません。",
      edge_label_error:        "まとめ役と各組織は対等な協力関係です。",
      hub_overuse:             "この2つは決まったまとめ役を通さない直接のつながりを持ちません。",
      support_layer_violation: "支援の矢印を出せるのは実働の層のチームだけです。",
      coordination_lateral:    "この2つは、それぞれのまとめ役を通してつながります。",
      coordination_dheat:      "DHEATは各チームのまとめ役ではありません。",
    };

    // tagBundlesAndShortenWhy（旧 injectCategoryIntros）: 各ステップに束ねキー（bundleKeyOf。
    // layer_mismatch は正解層単位、それ以外は category 単位）をタグ付けする。bundleループ方式では
    // 独立した「原理の確認」導入ステップは不要（ヒントステージがその役割を兼ねる）ため生成しない。
    // 束ねの誤りが2件以上あるとき、【なぜ】が定数の逐語反復であるもの（WHY_SHORT に定義があるもの）は
    // インスタンス側の why を短縮版に差し替える。layerReason / edgeReason 由来のインスタンス固有 why は
    // ここでは触らない（layer_mismatch は常に対象外）。
    function tagBundlesAndShortenWhy(steps) {
      const countByBundle = {};
      for (const s of steps) countByBundle[bundleKeyOf(s)] = (countByBundle[bundleKeyOf(s)] || 0) + 1;

      // hub_misassignment は swap/missing/overuse が混在するため、短縮対象は overuse のみ
      const isHubOveruse = (s) => s.category === "hub_misassignment" && s.error?.detail?.type === "overuse";

      for (const s of steps) {
        const bundleKey = bundleKeyOf(s);
        s.bundleKey = bundleKey; // showBundleStep / buildBundles での再計算を不要にする
        s.whyFull = s.why; // 短縮前の完全版 why を退避（圧縮表示 buildCompressedAnswerTexts 用）
        const count = countByBundle[bundleKey];

        if (count >= 2) {
          if (s.category === "command_overuse")              s.why = WHY_SHORT.command_overuse;
          else if (s.category === "edge_label_error")         s.why = WHY_SHORT.edge_label_error;
          else if (s.category === "support_layer_violation")  s.why = WHY_SHORT.support_layer_violation;
          else if (isHubOveruse(s))                           s.why = WHY_SHORT.hub_overuse;
          else if (s.category === "coordination_path_error") {
            // [ADDED axis4] 束は category 単位＝subtype 混在のまま1束（bundleKeyOf は変更しない）
            s.why = (s.error?.detail?.subtype === "command_support_as_hub")
              ? WHY_SHORT.coordination_dheat
              : WHY_SHORT.coordination_lateral;
          }
          // layer_mismatch: 短縮しない（layerReason 由来のまま）
        }
      }

      return steps;
    }

    const steps = [];

    for (const err of errors) {
      const d = err.detail || {};
      const groupKey   = CATEGORY_GROUP[err.category] || "support";
      const groupLabel = GROUP_LABEL[groupKey] || groupKey;
      let what = "", why = "", fix = "";
      let involvedLabels = [];
      let ghostTargets   = { nodes: [], edges: [] };
      // whyOwner: この why がどのノードの edgeReason に帰属するか（圧縮表示の重複排除キー用）。
      // 定数WHY（WHY_CMD_OVERUSE 等）や layer_mismatch では null のまま。
      let whyOwner = null;

      switch (err.category) {
        case "layer_mismatch": {
          const gotStr = layerName(d.got);
          const expStr = layerName(d.expected);
          what = d.got === null || d.got === undefined
            ? `「${d.label}」の層が設定されていません。正しくは${expStr}です。`
            : `「${d.label}」が${gotStr}に置かれています。正しくは${expStr}です。`;
          why  = idealNodeMap[d.label]?.layerReason
               || `この組織の役割から、${expStr}に置きます。`;
          fix  = `「${d.label}」を${expStr}へ移動してください。`;
          involvedLabels = [d.label];
          ghostTargets   = { nodes: [d.label], edges: [] };
          break;
        }
        case "command_missing": {
          what = `「${d.fromLabel}」から「${d.toLabel}」への指示命令の矢印がありません。`;
          const nonHo = d.fromLabel === "C県A保健所" ? d.toLabel : d.fromLabel;
          why  = idealNodeMap[nonHo]?.edgeReason
               || `「${nonHo}」への指示命令の系統が必要です。`;
          fix  = `「${d.fromLabel}」から「${d.toLabel}」へ指示命令の矢印を引いてください。`;
          involvedLabels = [d.fromLabel, d.toLabel];
          ghostTargets   = { nodes: [], edges: [{ from: d.fromLabel, to: d.toLabel, label: "指示命令" }] };
          whyOwner = nonHo;
          break;
        }
        case "command_overuse": {
          what = `「${d.fromLabel}」から「${d.toLabel}」へ指示命令の矢印が引かれていますが、この2つは指示命令の関係ではありません。`;
          why  = WHY_CMD_OVERUSE;
          fix  = "この指示命令の矢印を削除してください。つながり自体が必要な場合は、連携協力で引き直してください。";
          involvedLabels = [d.fromLabel, d.toLabel];
          ghostTargets   = { nodes: [], edges: [] };
          break;
        }
        case "edge_label_error": {
          what = `「${d.fromLabel}」と「${d.toLabel}」をつなぐこと自体は正しいのですが、矢印の種類が「${d.gotLabel}」になっています。`;
          why  = WHY_EDGE_LABEL;
          fix  = `この矢印の種類を「${d.expectedLabel}」に変更してください。`;
          involvedLabels = [d.fromLabel, d.toLabel];
          ghostTargets   = { nodes: [], edges: [{ from: d.fromLabel, to: d.toLabel, label: d.expectedLabel }] };
          break;
        }
        case "hub_misassignment": {
          if (d.type === "swap") {
            what = `「${d.peripheral}」が「${d.wrongHub}」につながっていますが、正しいまとめ役は「${d.correctHub}」です。`;
            why  = idealNodeMap[d.correctHub]?.edgeReason
                 || `「${d.correctHub}」が${d.peripheral}のまとめ役です。`;
            fix  = `「${d.peripheral}」の連携協力の矢印を、「${d.wrongHub}」から「${d.correctHub}」へつなぎ直してください。`;
            involvedLabels = [d.peripheral, d.wrongHub, d.correctHub];
            ghostTargets   = { nodes: [], edges: [{ from: d.correctHub, to: d.peripheral, label: "連携協力" }] };
            whyOwner = d.correctHub;
          } else if (d.type === "missing") {
            what = `「${d.fromLabel}」と「${d.toLabel}」の間に連携協力のつながりがありません。`;
            let hubLabel;
            if (HUBS_FOR_DIFF.has(d.fromLabel) && HUBS_FOR_DIFF.has(d.toLabel)) {
              hubLabel = d.fromLabel !== "C県A保健所" ? d.fromLabel : d.toLabel;
            } else {
              hubLabel = HUBS_FOR_DIFF.has(d.fromLabel) ? d.fromLabel : d.toLabel;
            }
            why  = idealNodeMap[hubLabel]?.edgeReason
                 || `「${hubLabel}」を通じた連携協力が必要です。`;
            fix  = `「${d.fromLabel}」と「${d.toLabel}」を連携協力（双方向）の矢印で結んでください。`;
            involvedLabels = [d.fromLabel, d.toLabel];
            ghostTargets   = { nodes: [], edges: [{ from: d.fromLabel, to: d.toLabel, label: "連携協力" }] };
            whyOwner = hubLabel;
          } else {
            what = `「${d.fromLabel}」と「${d.toLabel}」の間に余分なつながりがあります。この2つは直接つなぎません。`;
            why  = WHY_HUB_OVERUSE;
            fix  = "この矢印を削除してください。";
            involvedLabels = [d.fromLabel, d.toLabel];
            ghostTargets   = { nodes: [], edges: [] };
          }
          break;
        }
        case "support_layer_violation": {
          what = `「${d.fromLabel}」から支援の矢印が出ていますが、支援の矢印を出せるのは実働の層のチームだけです。`;
          why  = WHY_SUPPORT_VIOLATION;
          fix  = "この支援の矢印を削除してください。必要なら、実働の層のチームから引き直してください。";
          involvedLabels = [d.fromLabel, d.toLabel];
          ghostTargets   = { nodes: [], edges: [] };
          break;
        }
        case "support_missing": {
          what = `「${d.fromLabel}」から「${d.toLabel}」への支援の矢印がありません。`;
          why  = idealNodeMap[d.fromLabel]?.edgeReason
               || `「${d.fromLabel}」の役割として、${d.toLabel}への支援が必要です。`;
          fix  = `「${d.fromLabel}」から「${d.toLabel}」へ支援の矢印を引いてください。`;
          involvedLabels = [d.fromLabel, d.toLabel];
          ghostTargets   = { nodes: [], edges: [{ from: d.fromLabel, to: d.toLabel, label: "支援" }] };
          whyOwner = d.fromLabel;
          break;
        }
        case "support_overuse": {
          what = `「${d.fromLabel}」から「${d.toLabel}」へ支援の矢印がありますが、この支援関係は正解構造にはありません。`;
          const fromReason = idealNodeMap[d.fromLabel]?.edgeReason;
          why  = fromReason
               ? `${fromReason}役割に合った支援先だけに矢印を引きます。`
               : "役割に合った支援先だけに矢印を引きます。";
          fix  = "この矢印を削除してください。";
          involvedLabels = [d.fromLabel, d.toLabel];
          ghostTargets   = { nodes: [], edges: [] };
          whyOwner = fromReason ? d.fromLabel : null;
          break;
        }
        case "coordination_path_error": {
          const isDheat = d.subtype === "command_support_as_hub";
          what = isDheat
            ? `「${d.fromLabel}」と「${d.toLabel}」が連携協力でつながっていますが、DHEATは各チームのまとめ役ではありません。`
            : `「${d.fromLabel}」と「${d.toLabel}」が連携協力で直接つながっていますが、この2つは直接つなぎません。`;
          why  = isDheat ? WHY_COORD_DHEAT : WHY_COORD_LATERAL;
          fix  = "この矢印を削除してください。つながりが必要な場合は、それぞれのまとめ役を経由する構造を確認してください。";
          involvedLabels = [d.fromLabel, d.toLabel];
          ghostTargets   = { nodes: [], edges: [] };
          break;
        }
        default: {
          what = `不明なエラー (${err.category})`;
          why  = "";
          fix  = "マップを修正してください。";
          break;
        }
      }

      steps.push({ type: "error", category: err.category, groupKey, groupLabel, involvedLabels, what, why, fix, whyOwner, error: err, ghostTargets });
    }

    steps.sort((a, b) =>
      (GROUP_ORDER.indexOf(a.groupKey) - GROUP_ORDER.indexOf(b.groupKey)) ||
      (CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)) ||
      ((a.category === "layer_mismatch" && b.category === "layer_mismatch")
        ? ((a.error?.detail?.expected ?? 0) - (b.error?.detail?.expected ?? 0))
        : 0)
    );
    return tagBundlesAndShortenWhy(steps);
  }

  // buildBundles: buildWalkthroughSteps の出力（type==="error" のみ、既に bundleKey タグ付け・
  // ソート済み）を bundleKey の初出順に集約し、bundleループが1つずつ処理する単位を作る。
  function buildBundles(errorSteps) {
    const bundles = [];
    const byKey = {};
    for (const s of errorSteps) {
      let bundle = byKey[s.bundleKey];
      if (!bundle) {
        bundle = {
          bundleKey:      s.bundleKey,
          category:       s.category,
          groupKey:       s.groupKey,
          groupLabel:     s.groupLabel,
          expectedLayerId: s.category === "layer_mismatch" ? (s.error?.detail?.expected ?? null) : null,
          involvedLabels: [],
          errors:         [],
        };
        byKey[s.bundleKey] = bundle;
        bundles.push(bundle);
      }
      for (const label of s.involvedLabels) {
        if (!bundle.involvedLabels.includes(label)) bundle.involvedLabels.push(label);
      }
      bundle.errors.push(s.error);
    }
    return bundles;
  }

  // buildCompressedAnswerTexts: エッジ差分bundleループの正解ステージ（案B / compressed_v1〜v2）用。
  // 束内の複数インスタンスを「カテゴリ別ヘッダ＋関係リスト」に圧縮する純粋関数（DOMに触れない。
  // 依存は引数の relatedSteps のみで、Node上で単体実行できるようヘルパーはすべて内部にネストする）。
  // 情報の欠落はゼロ（すべての from→to ペア・すべての固有理由は表示に残る）。レイヤー側では使わない。
  // [CHANGED compressed_v2] プレーン文字列（what/why/fix）に加え、ノード名segment付きの行配列
  // （whatLines/whyLines。各行は [{text, isNode}] の配列）も返す。文字列側の内容・書式は
  // v1から一切変更していない（whatLines/whyLines の segment を単純連結すれば同一文字列になる）。
  function buildCompressedAnswerTexts(relatedSteps) {
    const category = relatedSteps[0]?.category;

    function seg(text, isNode) { return { text, isNode: !!isNode }; }
    function lineText(segments) { return segments.map(s => s.text).join(""); }

    // fromLabel でグルーピングし、宛先を「・」連結する行を作る（support_missing / command_missing 共通）。
    function groupedByFromLines(steps, header) {
      const order = [];
      const byFrom = new Map();
      for (const s of steps) {
        const d = s.error?.detail || {};
        if (!byFrom.has(d.fromLabel)) { byFrom.set(d.fromLabel, []); order.push(d.fromLabel); }
        byFrom.get(d.fromLabel).push(d.toLabel);
      }
      const lines = [[seg(header, false)]];
      for (const from of order) {
        const segments = [seg("・", false), seg(from, true), seg(" → ", false)];
        byFrom.get(from).forEach((to, i) => {
          if (i > 0) segments.push(seg("・", false));
          segments.push(seg(to, true));
        });
        lines.push(segments);
      }
      return lines;
    }

    // fromLabel/toLabel の単純な列挙（矢印記号は呼び出し側で指定）。
    function pairListLines(steps, header, arrow) {
      const lines = [[seg(header, false)]];
      for (const s of steps) {
        const d = s.error?.detail || {};
        lines.push([seg("・", false), seg(d.fromLabel, true), seg(` ${arrow} `, false), seg(d.toLabel, true)]);
      }
      return lines;
    }

    function edgeLabelErrorLines(steps) {
      const lines = [[seg("つなぐこと自体は正しいが、種類が違う矢印：", false)]];
      for (const s of steps) {
        const d = s.error?.detail || {};
        lines.push([
          seg("・", false), seg(d.fromLabel, true), seg(" ⇔ ", false), seg(d.toLabel, true),
          seg("：「", false), seg(d.gotLabel, false), seg("」→ 正しくは「", false), seg(d.expectedLabel, false), seg("」", false),
        ]);
      }
      return lines;
    }

    // hub_misassignment: swap/missing/overuse 混在。存在するタイプのみ、この順でサブブロックを出す。
    function hubMisassignmentLines(steps) {
      const swapSteps     = steps.filter(s => s.error?.detail?.type === "swap");
      const missingSteps  = steps.filter(s => s.error?.detail?.type === "missing");
      const overuseSteps  = steps.filter(s => s.error?.detail?.type === "overuse");
      const blocks = [];
      if (swapSteps.length) {
        const lines = [[seg("つなぎ直すもの：", false)]];
        for (const s of swapSteps) {
          const d = s.error.detail;
          lines.push([
            seg("・「", false), seg(d.peripheral, true), seg("」：", false),
            seg(d.wrongHub, true), seg(" → ", false), seg(d.correctHub, true),
          ]);
        }
        blocks.push(lines);
      }
      if (missingSteps.length) {
        const lines = [[seg("不足している連携協力（マップ上の点線）：", false)]];
        for (const s of missingSteps) {
          const d = s.error.detail;
          lines.push([seg("・", false), seg(d.fromLabel, true), seg(" ⇔ ", false), seg(d.toLabel, true)]);
        }
        blocks.push(lines);
      }
      if (overuseSteps.length) {
        const lines = [[seg("余分な直接のつながり：", false)]];
        for (const s of overuseSteps) {
          const d = s.error.detail;
          lines.push([seg("・", false), seg(d.fromLabel, true), seg(" ⇔ ", false), seg(d.toLabel, true)]);
        }
        blocks.push(lines);
      }
      // サブブロック間は空行1つで区切る（空行 = 空文字segment1個の行）
      const result = [];
      blocks.forEach((block, i) => {
        if (i > 0) result.push([seg("", false)]);
        result.push(...block);
      });
      return result;
    }

    function buildWhatLines() {
      switch (category) {
        case "support_missing":
          return groupedByFromLines(relatedSteps, "不足している支援の矢印（マップ上の点線）：");
        case "command_missing":
          return groupedByFromLines(relatedSteps, "不足している指示命令の矢印（マップ上の点線）：");
        case "command_overuse":
          return pairListLines(relatedSteps, "指示命令の関係ではないのに、指示命令になっている矢印：", "→");
        case "edge_label_error":
          return edgeLabelErrorLines(relatedSteps);
        case "hub_misassignment":
          return hubMisassignmentLines(relatedSteps);
        case "support_layer_violation":
          return pairListLines(relatedSteps, "実働の層以外から出ている支援の矢印：", "→");
        case "support_overuse":
          return pairListLines(relatedSteps, "正解構造にはない支援の矢印：", "→");
        default:
          return relatedSteps.map(s => [seg(s.what, false)]);
      }
    }

    // whyOwner 単位で重複排除し、各固有理由を1回だけ完全版（whyFull）で表示する。
    function buildWhyLines() {
      const seen = new Set();
      const constLines   = []; // [{text,isNode}] の行配列
      const ownerEntries = []; // {owner, text}
      for (const s of relatedSteps) {
        const text = s.whyFull ?? s.why;
        if (!text) continue;
        const owner = s.whyOwner ?? null;
        const key = (owner ?? "__const__") + "|" + text;
        if (seen.has(key)) continue;
        seen.add(key);
        if (owner) ownerEntries.push({ owner, text });
        else constLines.push([seg(text, false)]);
      }
      // 一意化後に1行しか残らない場合は「・」を付けない（定数WHY行はもともと付けない）
      const soloOwner = (constLines.length === 0 && ownerEntries.length === 1);
      const ownerLines = ownerEntries.map(e => soloOwner
        ? [seg("「", false), seg(e.owner, true), seg("」：", false), seg(e.text, false)]
        : [seg("・「", false), seg(e.owner, true), seg("」：", false), seg(e.text, false)]
      );
      return [...constLines, ...ownerLines];
    }

    // カテゴリ単位の1文（インスタンス反復を全廃）。組織名を含まないためsegment化は不要。
    function buildFix() {
      const FIX_TEXTS = {
        support_missing:          "点線の矢印を、それぞれ支援元から支援先へ引いてください。",
        command_missing:          "点線のとおり、指示命令の矢印をそれぞれ引いてください。",
        command_overuse:          "上記の矢印を削除してください。つながり自体が必要な場合は、連携協力で引き直してください。",
        edge_label_error:         "矢印の種類を、それぞれ「正しくは」の種類に変更してください。",
        support_layer_violation:  "上記の支援の矢印を削除してください。必要なら、実働の層のチームから引き直してください。",
        support_overuse:          "上記の矢印を削除してください。",
      };
      if (category === "hub_misassignment") {
        const types = new Set(relatedSteps.map(s => s.error?.detail?.type));
        const lines = [];
        if (types.has("swap"))    lines.push("連携協力の矢印を、正しいまとめ役へつなぎ直してください。");
        if (types.has("missing")) lines.push("点線のとおり、連携協力（双方向）の矢印で結んでください。");
        if (types.has("overuse")) lines.push("余分な矢印を削除してください。");
        return lines.join("\n");
      }
      if (FIX_TEXTS[category]) return FIX_TEXTS[category];
      return relatedSteps.map(s => s.fix).join("\n");
    }

    const whatLines = buildWhatLines();
    const whyLines  = buildWhyLines();

    return {
      what: whatLines.map(lineText).join("\n"),
      why:  whyLines.map(lineText).join("\n"),
      fix:  buildFix(),
      whatLines,
      whyLines,
    };
  }

  // getGhostBandCenterY: 指定層バンドの垂直中央を canvasEl コンテンツ座標で返す。
  // fitToWrap の CSS transform を受けた canvasEl でも正確に動作する（§4 参照）。
  function getGhostBandCenterY(layerId, canvasEl, canvasWrapEl) {
    const band = canvasWrapEl.querySelector(`.layer-band[data-layer="${layerId}"]`);
    const canvasRect = canvasEl.getBoundingClientRect();
    const scale = canvasEl.offsetHeight > 0
      ? canvasRect.height / canvasEl.offsetHeight
      : 1;
    if (!band) {
      const wrapRect = canvasWrapEl.getBoundingClientRect();
      const screenY  = wrapRect.top + wrapRect.height * (layerId * 0.25 - 0.125);
      return (screenY - canvasRect.top) / scale;
    }
    const bandRect = band.getBoundingClientRect();
    const screenY  = bandRect.top + bandRect.height / 2;
    return (screenY - canvasRect.top) / scale;
  }

  // drawGhostEdgeByIds: ゴーストエッジの実装本体（id 直接指定）。
  // チップ文字列を引数化し、不足エッジ（チップ「不足」）と誘導矢印（チップ「移動」）で共用する。
  // ctx: { svgEl, learnNodes, learnEdges, canvasEl, canvasWrapEl, extraNodes? }
  function drawGhostEdgeByIds(fromId, toId, edgeLabel, chipText, ctx) {
    const { svgEl, learnNodes, learnEdges, canvasEl, canvasWrapEl } = ctx;
    const nodesForBuild = ctx.extraNodes
      ? [...learnNodes, ...ctx.extraNodes]
      : learnNodes;

    const ghostEdge = { id: `ghost-${fromId}-${toId}`, from: fromId, to: toId, label: edgeLabel || "", bidirectional: false };
    const allEdgesForGhost = [...(learnEdges || []), ghostEdge];

    const g = buildROEdgeGroup(ghostEdge, nodesForBuild, allEdgesForGhost, { canvasEl, svgEl, canvasWrapEl, markerSuffix: "" });
    if (!g) return;

    g.removeAttribute("data-from");
    g.removeAttribute("data-to");
    g.dataset.ghostFrom = fromId;
    g.dataset.ghostTo   = toId;
    g.classList.add("diff-ghost-edge", "diff-edge-missing");

    const path = g.querySelector("path");
    if (path) {
      path.setAttribute("marker-end", "url(#arrow-ghost-diff)");
      path.removeAttribute("marker-start");
      path.removeAttribute("stroke");
      path.removeAttribute("opacity");
    }

    for (const el of [...g.querySelectorAll("rect, text")]) el.remove();

    svgEl.appendChild(g);

    if (!path) return;

    requestAnimationFrame(() => {
      const len = path.getTotalLength();
      path.style.strokeDasharray  = String(len);
      path.style.strokeDashoffset = String(len);
      path.style.transition       = "stroke-dashoffset 0.5s ease";
      requestAnimationFrame(() => {
        path.style.strokeDashoffset = "0";
        setTimeout(() => {
          path.style.transition       = "";
          path.style.strokeDasharray  = "8,5";
          path.style.strokeDashoffset = "";

          const mid = path.getPointAtLength(len / 2);
          const mx = mid.x, my = mid.y;
          const chipW = 30, chipH = 16, chipR = 4;

          const chipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          chipRect.setAttribute("x",            String(mx - chipW / 2));
          chipRect.setAttribute("y",            String(my - chipH / 2));
          chipRect.setAttribute("width",        String(chipW));
          chipRect.setAttribute("height",       String(chipH));
          chipRect.setAttribute("rx",           String(chipR));
          chipRect.setAttribute("ry",           String(chipR));
          chipRect.setAttribute("fill",         "rgba(20,24,36,0.92)");
          chipRect.setAttribute("stroke",       "rgba(200,200,210,0.45)");
          chipRect.setAttribute("stroke-width", "1");
          chipRect.style.opacity = "0";

          const chipEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
          chipEl.setAttribute("x",           String(mx));
          chipEl.setAttribute("y",           String(my + 4));
          chipEl.setAttribute("text-anchor", "middle");
          chipEl.setAttribute("font-size",   "11");
          chipEl.setAttribute("font-family", "sans-serif");
          chipEl.setAttribute("fill",        "rgba(200,200,210,0.9)");
          chipEl.textContent  = chipText;
          chipEl.style.opacity = "0";

          g.appendChild(chipRect);
          g.appendChild(chipEl);

          requestAnimationFrame(() => {
            chipRect.style.transition = "opacity 0.25s ease";
            chipEl.style.transition   = "opacity 0.25s ease";
            chipRect.style.opacity    = "1";
            chipEl.style.opacity      = "1";
          });
        }, 510);
      });
    });
  }

  // drawGhostEdge: label 解決後に drawGhostEdgeByIds を呼ぶ薄いラッパー（不足エッジ用）。
  // 挙動・見た目は第1.6段階から一切変化しない。
  function drawGhostEdge(svgEl, fromLabel, toLabel, labelToId, learnNodes, learnEdges, canvasEl, canvasWrapEl, edgeLabel) {
    const fromId = labelToId[fromLabel];
    const toId   = labelToId[toLabel];
    if (!fromId || !toId) return;
    drawGhostEdgeByIds(fromId, toId, edgeLabel, "不足", { svgEl, learnNodes, learnEdges, canvasEl, canvasWrapEl });
  }

  // drawGhostNode: layer_mismatch ステップ用。正しい層バンド中央に半透明ゴーストノードを配置する。
  // 返り値: 配置・フェードイン開始済みの要素、または null（実ノードが見つからない場合）。
  function drawGhostNode(label, expectedLayerId, ctx) {
    const { canvasEl, canvasWrapEl, labelToId } = ctx;
    const realNodeId = labelToId[label];
    if (!realNodeId) return null;
    const realEl = canvasEl.querySelector(`.node[data-id="${realNodeId}"]`);
    if (!realEl) return null;

    const ghostId = "gnode-" + realNodeId;
    const ghostEl = document.createElement("div");
    ghostEl.className  = `node layer-${expectedLayerId} diff-ghost-node`;
    ghostEl.dataset.id = ghostId;
    ghostEl.innerHTML  = `<div class="ntitle">${esc(label)}</div>`;

    // visibility:hidden で append → サイズ計測 → 最終位置設定
    ghostEl.style.visibility = "hidden";
    ghostEl.style.opacity    = "0";
    canvasEl.appendChild(ghostEl);

    const ghostH = ghostEl.offsetHeight;
    const targetY = getGhostBandCenterY(expectedLayerId, canvasEl, canvasWrapEl);
    const left  = realEl.offsetLeft;
    let   top   = targetY - ghostH / 2;
    if (ghostH > 0) {
      top = Math.max(0, Math.min(top, canvasEl.offsetHeight - ghostH));
    }
    ghostEl.style.left       = left + "px";
    ghostEl.style.top        = top  + "px";
    ghostEl.style.visibility = "";

    requestAnimationFrame(() => {
      ghostEl.style.transition = "opacity 0.3s ease";
      ghostEl.style.opacity    = "0.4";
    });

    return ghostEl;
  }

  // highlightDiffEdge: エラー1件に対してエッジ（既存=警告強調 / 不足=ゴースト）を適用する。
  // noGhost=true のとき drawGhostEdge を呼ばない（確認完了状態での全件表示用）。
  function highlightDiffEdge(svgEl, err, labelToId, learnEdges, learnNodes, canvasEl, canvasWrapEl, noGhost) {
    const d = err.detail || {};

    const findExistingEdgeGroup = (fromLabel, toLabel) => {
      const fromId = labelToId[fromLabel];
      const toId   = labelToId[toLabel];
      if (!fromId || !toId) return null;
      const g1 = svgEl.querySelector(`g[data-from="${fromId}"][data-to="${toId}"]`);
      if (g1) return g1;
      return svgEl.querySelector(`g[data-from="${toId}"][data-to="${fromId}"]`);
    };

    const alertExisting = (fromLabel, toLabel) => {
      const g = findExistingEdgeGroup(fromLabel, toLabel);
      if (g) g.classList.add("diff-edge-alert");
    };

    const ghostMissing = (fromLabel, toLabel, edgeLabel) => {
      if (!noGhost) drawGhostEdge(svgEl, fromLabel, toLabel, labelToId, learnNodes, learnEdges, canvasEl, canvasWrapEl, edgeLabel);
    };

    switch (err.category) {
      case "command_overuse":         alertExisting(d.fromLabel, d.toLabel); break;
      case "command_missing":         ghostMissing(d.fromLabel, d.toLabel, "指示命令"); break;
      case "edge_label_error":        alertExisting(d.fromLabel, d.toLabel); break;
      case "support_layer_violation": alertExisting(d.fromLabel, d.toLabel); break;
      case "support_overuse":         alertExisting(d.fromLabel, d.toLabel); break;
      case "support_missing":         ghostMissing(d.fromLabel, d.toLabel, "支援"); break;
      case "coordination_path_error": alertExisting(d.fromLabel, d.toLabel); break;
      case "hub_misassignment": {
        if (d.type === "swap") {
          alertExisting(d.wrongHub, d.peripheral);
          ghostMissing(d.correctHub, d.peripheral, "連携協力");
        } else if (d.type === "missing") {
          ghostMissing(d.fromLabel, d.toLabel, "連携協力");
        } else if (d.type === "overuse") {
          alertExisting(d.fromLabel, d.toLabel);
        }
        break;
      }
    }
  }

  // ensureDiffMarker: ghost 矢印用マーカーを SVG defs に一度だけ追加する（冪等）。
  function ensureDiffMarker(svgEl) {
    let defs = svgEl.querySelector("defs");
    if (!defs) { defs = document.createElementNS("http://www.w3.org/2000/svg", "defs"); svgEl.prepend(defs); }
    if (!defs.querySelector("#arrow-ghost-diff")) {
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
      marker.setAttribute("id", "arrow-ghost-diff");
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "9"); marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "6"); marker.setAttribute("markerHeight", "6");
      marker.setAttribute("orient", "auto-start-reverse");
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      p.setAttribute("fill", "rgba(200,200,210,0.85)");
      marker.appendChild(p);
      defs.appendChild(marker);
    }
  }

  // applyErrorHighlight: エラー1件分のノード + エッジ強調を適用する。
  // applyDiffOverlay の内部ループから抽出（ウォークスルーとの共用）。
  function applyErrorHighlight(err, ctx) {
    const { canvasEl, svgEl, labelToId, learnNodes, canvasWrapEl } = ctx;
    const d = err.detail || {};

    // ノードハイライト（カテゴリ不問で統一クラス diff-node-alert を付与）
    const addNodeAlert = (label) => {
      const id = label && labelToId[label];
      if (!id) return;
      const el = canvasEl.querySelector(`.node[data-id="${id}"]`);
      if (el) el.classList.add("diff-node-alert");
    };

    switch (err.category) {
      case "layer_mismatch":
        addNodeAlert(d.label);
        if (!ctx.noGhost) {
          const ghostEl = drawGhostNode(d.label, d.expected, ctx);
          if (ghostEl) {
            const realNodeId = ctx.labelToId[d.label];
            const ghostNodeId = "gnode-" + realNodeId;
            drawGhostEdgeByIds(realNodeId, ghostNodeId, "移動", "移動", {
              svgEl:       ctx.svgEl,
              learnNodes:  ctx.learnNodes,
              learnEdges:  ctx.learnEdges || [],
              canvasEl:    ctx.canvasEl,
              canvasWrapEl: ctx.canvasWrapEl,
              extraNodes:  [{ id: ghostNodeId, x: 0, y: 0 }],
            });
          }
        }
        break;
      case "hub_misassignment": {
        let targetLabel;
        if (d.type === "swap") {
          targetLabel = d.peripheral;
        } else {
          const from = d.fromLabel, to = d.toLabel;
          targetLabel = (from && !HUBS_FOR_DIFF.has(from)) ? from
                      : (to   && !HUBS_FOR_DIFF.has(to))   ? to
                      : (from || to);
        }
        addNodeAlert(targetLabel);
        break;
      }
    }

    // エッジハイライト（noGhost は確認完了状態でゴーストを描かないために使用）
    highlightDiffEdge(svgEl, err, labelToId, ctx.learnEdges || [], learnNodes, canvasEl, canvasWrapEl, ctx.noGhost || false);
  }

  // applyDiffOverlay: result.errors を走査してノード・エッジに差分クラスを付与する。
  // canvasWrapEl は getBoundingClientRect() 基準点として必要。
  function applyDiffOverlay(canvasEl, svgEl, result, labelToId, learnNodes, canvasWrapEl) {
    if (!result || !result.errors) return;
    ensureDiffMarker(svgEl);
    const ctx = { canvasEl, svgEl, labelToId, learnNodes, canvasWrapEl };
    for (const err of result.errors) {
      applyErrorHighlight(err, ctx);
    }
  }

  // showDiffTooltip / hideDiffTooltip: 差分提示ビューのノードホバー用。
  function showDiffTooltip(html, anchorEl) {
    const tooltip = document.getElementById("acuteDiffTooltip");
    if (!tooltip) return;
    tooltip.innerHTML = html;
    tooltip.style.display = "block";
    _positionTooltip(anchorEl, "acuteDiffTooltip");
  }

  function hideDiffTooltip() {
    const tooltip = document.getElementById("acuteDiffTooltip");
    if (tooltip) tooltip.style.display = "none";
  }

  // attachDiffTooltips: diff overlay 後に各エラーノードにホバー説明を付与する。
  function attachDiffTooltips(canvasEl, learnNodes) {
    if (!state.acuteScore) return;
    const errsByLabel = {};
    for (const err of state.acuteScore.errors) {
      const d = err.detail || {};
      let label;
      switch (err.category) {
        case "layer_mismatch":    label = d.label; break;
        case "hub_misassignment": label = d.type === "swap" ? d.peripheral
          : (!HUBS_FOR_DIFF.has(d.fromLabel) ? d.fromLabel : d.toLabel); break;
      }
      if (!label) continue;
      if (!errsByLabel[label]) errsByLabel[label] = [];
      errsByLabel[label].push(err);
    }

    for (const [label, errs] of Object.entries(errsByLabel)) {
      const nodeEl = canvasEl.querySelector(`.node[data-id="${
        learnNodes.find(n => n.label === label)?.id || ""
      }"]`);
      if (!nodeEl) continue;
      const lines = errs.map(e => {
        const d = e.detail || {};
        if (e.category === "layer_mismatch") {
          return `層エラー: あなたは L${d.got} → 正解は L${d.expected}`;
        }
        if (e.category === "hub_misassignment") {
          if (d.type === "swap")    return `連携先エラー: ${d.wrongHub} → 正解は ${d.correctHub}`;
          if (d.type === "missing") return `連携不足: ${d.fromLabel}↔${d.toLabel}`;
          if (d.type === "overuse") return `余分な連携: ${d.fromLabel}↔${d.toLabel}`;
        }
        return "";
      }).filter(Boolean);

      nodeEl.addEventListener("mouseenter", () => showDiffTooltip(lines.map(l => esc(l)).join("<br>"), nodeEl));
      nodeEl.addEventListener("mouseleave", hideDiffTooltip);
    }
  }

  // ================================================================
  // ウォークスルー（ACUTE_DIFF）状態
  // ================================================================

  let _dwSteps  = [];   // buildWalkthroughSteps の出力（bundleKey付き。answerステージの内容ソース）
  let _dwCtx    = null; // { canvasEl, svgEl, labelToId, learnNodes, learnEdges, canvasWrapEl }
  let _dwErrors = [];   // initBundleLoop に渡された errors 配列（完了ステップの一括表示で使用）
  let _dwStage  = "edge";   // "layer"（フェーズ12）| "edge"（フェーズ10）。文言の書き分けに使用

  // [NEW] bundleループ状態（ヒント→自己修正→正解＋WHY）
  let _dwBundles       = [];     // buildBundles の出力
  let _dwBundleIndex   = -1;     // -1=概要, 0..N-1=bundle, N=完了
  let _dwStageInBundle = "hint"; // "hint" | "answer"
  let _dwBundleBefore  = {};     // bundleKey -> { count, errors }（ヒント表示時点で1回だけ記録）
  // [ADDED flow-v2補修] walkthrough完了画面（index=N）に到達したかどうか。退出ゲートに使う。
  // localStorageへ永続化しない（リロード再初期化のたびに再走破させる意図的設計）。
  let _dwReachedComplete = false;

  // clearWalkthroughHighlights: diff 系クラスとゴーストエッジをすべて除去する。
  function clearWalkthroughHighlights() {
    const canvasEl = $("canvas-diff");
    const svgEl    = $("svgLayer-diff");
    if (!canvasEl || !svgEl) return;

    const NODE_CLASSES = [
      "diff-node-alert",
      "diff-node-layer", "diff-node-hub",  // 旧クラス（防御的残置）
      "diff-dimmed",
    ];
    canvasEl.querySelectorAll(".node.diff-ghost-node").forEach(el => el.remove());
    canvasEl.querySelectorAll(".node").forEach(el => el.classList.remove(...NODE_CLASSES));

    svgEl.querySelectorAll("g.diff-ghost-edge").forEach(el => el.remove());

    const EDGE_CLASSES = [
      "diff-dimmed",
      "diff-edge-alert", "diff-edge-missing",
      "diff-edge-cmd-over", "diff-edge-cmd-miss",   // 旧クラス（防御的残置）
      "diff-edge-label-wrong", "diff-edge-violation",
      "diff-edge-sup-over", "diff-edge-sup-miss", "diff-edge-generic",
    ];
    svgEl.querySelectorAll("g[data-from]").forEach(el => el.classList.remove(...EDGE_CLASSES));
  }

  // refreshDwCtxLiveArrays: _dwCtx.learnNodes/learnEdges を state.nodes/state.edges の最新参照に
  // 同期する。bundleループ中はマップが編集可能（エッジ削除は state.edges を再代入する）ため、
  // _dwCtx 生成時点の配列参照を使い続けると編集後に古い配列を参照してしまう。描画の直前に必ず呼ぶ。
  function refreshDwCtxLiveArrays() {
    if (!_dwCtx) return;
    _dwCtx.learnNodes = state.nodes;
    _dwCtx.learnEdges = state.edges;
  }

  // applyBundleDimming: マップ全体をディムし、bundle対象ノード・エッジのみディムを解除する
  // （操作はロックしない。①の設計判断：マップ全体は常に編集可能なまま）。
  function applyBundleDimming(bundle) {
    if (!_dwCtx) return;
    const { canvasEl, svgEl, labelToId, learnNodes } = _dwCtx;

    canvasEl.querySelectorAll(".node").forEach(el => el.classList.add("diff-dimmed"));
    svgEl.querySelectorAll("g[data-from]").forEach(el => el.classList.add("diff-dimmed"));

    for (const label of bundle.involvedLabels) {
      const id = labelToId[label];
      if (!id) continue;
      const el = canvasEl.querySelector(`.node[data-id="${id}"]`);
      if (el) el.classList.remove("diff-dimmed");
    }
    // bundle対象ノード同士を結ぶ既存エッジ（正誤問わず）もディム解除する。
    // ヒントステージでは applyErrorHighlight を呼ばない（正解を開示しないため）ので、
    // diff-edge-alert クラスによる解除だけでは対象ノード間の現在の接続が見えなくなってしまう。
    svgEl.querySelectorAll("g[data-from]").forEach(el => {
      const fromN = learnNodes.find(n => n.id === el.dataset.from);
      const toN   = learnNodes.find(n => n.id === el.dataset.to);
      if (fromN && toN && bundle.involvedLabels.includes(fromN.label) && bundle.involvedLabels.includes(toN.label)) {
        el.classList.remove("diff-dimmed");
      }
    });

    if (bundle.involvedLabels.length > 0) {
      const firstId = labelToId[bundle.involvedLabels[0]];
      if (firstId) {
        canvasEl.querySelector(`.node[data-id="${firstId}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }

  // computeBundleResiduals: 全体を再採点し、指定bundleKeyに属する残存エラーだけを絞り込んで返す
  // 純粋関数（state/windowへの直接依存を持たせない引数注入型）。captureBundleBefore /
  // confirmBundleFix / renderAnswerStage（adaptive_v1の進入時再採点）が共通で使う。
  function computeBundleResiduals(nodes, edges, idealMap, bundleKey, scoring) {
    const { normalizeMap, gradeAcuteMap } = scoring;
    const result = gradeAcuteMap(normalizeMap({ nodes, edges }), normalizeMap(idealMap));
    return result.errors.filter(e =>
      bundleKeyOf({ category: e.category, error: { detail: e.detail } }) === bundleKey
    );
  }

  // classifyBundleOutcome: adaptive_v1 の分岐判定（before=walkthrough構築時点の件数、
  // after=正解ステージ描画時点の残存件数）。純粋関数。
  function classifyBundleOutcome(before, after) {
    if (after === 0) return "resolved";
    return after < before ? "partial" : "unresolved";
  }

  // captureBundleBefore: bundle のヒント初回表示時点で1回だけ、そのbundleの残存エラー数を
  // 再採点して記録する（① の設計判断：他bundleの編集の影響を受けないよう毎回このタイミングで測る）。
  function captureBundleBefore(bundle) {
    if (!window.__ICS_SCORING__ || !window.idealMapAcute) {
      _dwBundleBefore[bundle.bundleKey] = { count: bundle.errors.length, errors: bundle.errors };
      return;
    }
    const residualsNow = computeBundleResiduals(
      state.nodes, state.edges, window.idealMapAcute, bundle.bundleKey, window.__ICS_SCORING__
    );
    _dwBundleBefore[bundle.bundleKey] = { count: residualsNow.length, errors: residualsNow };
  }

  // confirmBundleFix: 「修正できた」クリック時に呼ぶ。全体を再採点しbundleKeyで絞り込み、
  // HINT_REVISE_SCORED をログする。bundle.errors 自体は書き換えない（正解ステージは元の全メンバーの
  // what/why/fix をそのまま表示する。シンプルさ優先の設計判断）。
  function confirmBundleFix(bundle) {
    if (!window.__ICS_SCORING__ || !window.idealMapAcute) {
      logOp("HINT_REVISE_SCORED", {
        bundleKey: bundle.bundleKey,
        before: _dwBundleBefore[bundle.bundleKey]?.count ?? null,
        after: null,
        residuals: null,
      });
      saveToLocalStorage();
      return;
    }
    const residuals = computeBundleResiduals(
      state.nodes, state.edges, window.idealMapAcute, bundle.bundleKey, window.__ICS_SCORING__
    );
    logOp("HINT_REVISE_SCORED", {
      bundleKey: bundle.bundleKey,
      before: _dwBundleBefore[bundle.bundleKey]?.count ?? null,
      after: residuals.length,
      residuals: residuals.map(e => ({ category: e.category, detail: e.detail })),
    });
    saveToLocalStorage();
  }

  // buildHintContent: bundle のヒントステージ用テキストを組み立てる。正解（層・接続・ラベル）は
  // 一切含めない。layer_mismatch は HINT_TEXTS.layer_mismatch ＋ 各ノードの hintReason（理想マップ
  // JSON由来）を合成する。それ以外は HINT_TEXTS[category] を {from}/{to} 置換し、hub_misassignment は
  // correctHub が「C県A保健所」のケースを含む場合に hub_direct_supplement を続けて追記する。
  // splitTemplateToSegments: HINT_TEXTS のテンプレート文字列を {from}/{to} プレースホルダで
  // 分割し、固定文segment（isNode:false）とラベルsegment（isNode:true）の交互配列にする。
  // プレースホルダを含まないテンプレートは全体が1つの固定segmentになる。
  function splitTemplateToSegments(template, d) {
    return (template || "").split(/(\{from\}|\{to\})/g)
      .filter(part => part !== "")
      .map(part => {
        if (part === "{from}") return { text: d.fromLabel || "", isNode: true };
        if (part === "{to}")   return { text: d.toLabel   || "", isNode: true };
        return { text: part, isNode: false };
      });
  }

  function buildHintContent(bundle) {
    if (bundle.category === "layer_mismatch") {
      // layer_mismatch は変更しない（hintReason はインスタンス固有の自由文のため
      // segment分離もdedupも行わない。反復に見える場合はコンテンツ側＝JSONの冒頭文で対応する）。
      const lines = bundle.involvedLabels
        .map(label => window.idealMapAcute?.nodes?.find(n => n.label === label)?.hintReason)
        .filter(Boolean);
      return { what: HINT_TEXTS.layer_mismatch, why: lines.join("\n") };
    }

    // [CHANGED] {from}/{to} 置換後の行を、初出順の完全一致で重複排除する（compressed_v2）。
    // 定数テンプレート（プレースホルダなし）は自動的に1回表示になり、support_missing の
    // 同一支援元の複数エッジ（同一行）も1行に畳まれる。support_overuse のように各行が
    // 固有な場合は全行が残る。
    const seenLines = new Set();
    const whatLines = [];
    const dheatLines = []; // [ADDED hint_dheat_v1] 固定順（lateral→dheat）用の別積み
    for (const e of bundle.errors) {
      const d = e.detail || {};
      const isDheatHint = bundle.category === "coordination_path_error"
        && d.subtype === "command_support_as_hub";
      const template = isDheatHint
        ? HINT_TEXTS.coordination_path_error_dheat
        : HINT_TEXTS[bundle.category];
      const segments = splitTemplateToSegments(template, d);
      const text = segments.map(s => s.text).join("");
      if (seenLines.has(text)) continue;
      seenLines.add(text);
      (isDheatHint ? dheatLines : whatLines).push(segments);
    }
    whatLines.push(...dheatLines); // [ADDED hint_dheat_v1] 表示順を lateral→dheat に固定

    if (bundle.category === "hub_misassignment"
      && bundle.errors.some(e => e.detail?.correctHub === "C県A保健所")) {
      whatLines.push([{ text: HINT_TEXTS.hub_direct_supplement, isNode: false }]);
    }

    const what = whatLines.map(segments => segments.map(s => s.text).join("")).join("\n");
    return { what, why: "", whatLines };
  }

  // renderHintStage: bundle のヒントステージを描画する。正解は一切表示せず、マップは編集可能なまま
  // 対象bundle以外を暗く表示するのみ。
  // renderSegmentsInto: segment行配列（[{text,isNode}] の配列の配列）を el に安全に描画する。
  // innerHTML は使わず、行ごとに <div> を追加し、isNode:true の segment は
  // <span class="dw-node-name"> で包む。すべて textContent 代入のみで構築する（compressed_v2）。
  function renderSegmentsInto(el, lines) {
    if (!el) return;
    el.textContent = "";
    for (const segments of (lines || [])) {
      const lineDiv = document.createElement("div");
      for (const s of segments) {
        if (s.isNode) {
          const span = document.createElement("span");
          span.className = "dw-node-name";
          span.textContent = s.text;
          lineDiv.appendChild(span);
        } else {
          lineDiv.appendChild(document.createTextNode(s.text));
        }
      }
      el.appendChild(lineDiv);
    }
  }

  function renderHintStage(bundle, safeIdx, N, els) {
    const { counterEl, groupTagEl, stageTagEl, whatEl, whyEl, fixEl, prevBtn, nextBtn } = els;

    if (counterEl)  counterEl.textContent = `${safeIdx + 1} / ${N}`;
    if (groupTagEl) { groupTagEl.textContent = bundle.groupLabel; groupTagEl.style.display = ""; }
    if (stageTagEl) {
      stageTagEl.textContent = "ヒント";
      stageTagEl.className = "dw-group-tag dw-stage-hint";
      stageTagEl.style.display = "";
    }
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = "修正できた →"; }

    // [CHANGED compressed_v2] layer_mismatch 以外はヒントwhatを重複排除して描画するため、
    // その旨を hintRenderMode としてログに残す（layer側は従来どおりdedup非適用＝フィールドなし）。
    const isLayer = (bundle.category === "layer_mismatch");
    const isCoordination = (bundle.category === "coordination_path_error");
    if (!_dwBundleBefore[bundle.bundleKey]) {
      captureBundleBefore(bundle);
      logOp("HINT_SHOWN", {
        bundleKey: bundle.bundleKey, category: bundle.category,
        involvedLabels: bundle.involvedLabels, instanceCount: bundle.errors.length,
        ...(isLayer ? {} : { hintRenderMode: "dedupe_v1" }),
        // [ADDED hint_dheat_v1] coordination_path_error 束のみ、サブタイプ別ヒント文面の
        // 出し分け件数を計装する。lateral_coordination 以外（既定値含む）は lateral 側に計上。
        ...(isCoordination ? {
          subtypeCounts: bundle.errors.reduce((acc, e) => {
            const key = (e.detail?.subtype === "command_support_as_hub")
              ? "command_support_as_hub" : "lateral_coordination";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, { lateral_coordination: 0, command_support_as_hub: 0 }),
        } : {}),
      });
      saveToLocalStorage();
    }

    const { what, why, whatLines } = buildHintContent(bundle);
    if (isLayer) {
      if (whatEl) whatEl.textContent = what;
    } else if (whatEl) {
      renderSegmentsInto(whatEl, whatLines);
    }
    if (whyEl) {
      whyEl.textContent = why;
      // 「なぜ」は内容があるときだけ行ごと表示する（見出しの意味論を統一）。
      // エッジ側カテゴリの多くはヒントステージでwhyが常に空のため、行自体を隠す。
      if (whyEl.parentElement) whyEl.parentElement.style.display = why ? "" : "none";
    }
    if (fixEl)  fixEl.textContent  = "正解の層・接続・ラベルはまだ表示されません。自分で修正してみましょう。";

    applyBundleDimming(bundle);
  }

  // renderAnswerStage: bundle の正解＋WHYステージを描画する。既存の1件表示ロジック（what/why/fix ＋
  // ゴースト表示）をそのまま流用し、bundle内の全メンバーを一括で強調する。
  // computeOriginalWhyContent: bundle構築時点の全ステップ由来のWHY（adaptive_v1で「解消済み」
  // 「一部解消」の両分岐が必ず表示する、原理接触の均一性を担保するテキスト）。
  // compressed_v2のWHY構築（whyOwner付きwhyFullのdedupe）をそのまま使う。residualsには依存しない。
  function computeOriginalWhyContent(bundle) {
    const relatedSteps = _dwSteps.filter(s => s.bundleKey === bundle.bundleKey);
    if (_dwStage === "edge" && relatedSteps.length >= 2) {
      const compressed = buildCompressedAnswerTexts(relatedSteps);
      return { why: compressed.why, whyLines: compressed.whyLines };
    }
    return { why: relatedSteps.map(s => s.why).join("\n"), whyLines: null };
  }

  // buildResidualDisplayContent: 残存エラー（生のエラー配列）を表示用の what/why/fix に変換する
  // 表示専用のヘルパー。_dwSteps/_dwBundles（測定用の束構造）は書き換えない。
  // 2件以上かつエッジ側なら compressed_v2 経路（segment付き）、それ以外は単件表示経路に流す。
  function buildResidualDisplayContent(bundle, residuals) {
    if (residuals.length === 0) {
      return { what: "", why: "", fix: "", whatLines: null, whyLines: null, usedCompressed: false };
    }
    const idealNodes = (mapLoadStatus.idealAcute === "ready" && window.idealMapAcute)
      ? window.idealMapAcute.nodes : [];
    const residualSteps = buildWalkthroughSteps(residuals, idealNodes)
      .filter(s => s.bundleKey === bundle.bundleKey);
    if (_dwStage === "edge" && residualSteps.length >= 2) {
      const compressed = buildCompressedAnswerTexts(residualSteps);
      return { ...compressed, usedCompressed: true };
    }
    return {
      what: residualSteps.map(s => s.what).join("\n"),
      why:  residualSteps.map(s => s.why).join("\n"),
      fix:  residualSteps.map(s => s.fix).join("\n"),
      whatLines: null, whyLines: null, usedCompressed: false,
    };
  }

  // renderAnswerStage: bundle の正解＋WHYステージを描画する。[CHANGED adaptive_v1]
  // 描画のたびに（キャッシュせず）bundleを再採点し、解消済み（resolved）／一部解消（partial）／
  // 未解消（unresolved）で開示内容を出し分ける。ヒントステージには一切影響しない
  // （renderHintStage/buildHintContentは無変更）。
  function renderAnswerStage(bundle, safeIdx, N, els, opts) {
    const { counterEl, groupTagEl, stageTagEl, whatEl, whyEl, fixEl, prevBtn, nextBtn } = els;
    const silent = !!(opts && opts.silent);

    if (counterEl)  counterEl.textContent = `${safeIdx + 1} / ${N}`;
    if (groupTagEl) { groupTagEl.textContent = bundle.groupLabel; groupTagEl.style.display = ""; }
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = (safeIdx + 1 >= N) ? "確認完了へ →" : "次へ →"; }
    // ヒントステージで隠した「なぜ」行を復帰する（正解ステージのwhyは全分岐で必ず内容を持つ）。
    if (whyEl?.parentElement) whyEl.parentElement.style.display = "";

    const before = bundle.errors.length; // walkthrough構築時点の件数（分岐判定の固定基準）
    // 採点不能時は情報開示側に倒す（bundle.errors=未解消のまま表示）。ログは発生させない。
    const scoringAvailable = !!(window.__ICS_SCORING__ && window.idealMapAcute);
    const residuals = scoringAvailable
      ? computeBundleResiduals(state.nodes, state.edges, window.idealMapAcute, bundle.bundleKey, window.__ICS_SCORING__)
      : bundle.errors;
    const after = residuals.length;
    const bundleOutcome = classifyBundleOutcome(before, after);

    if (stageTagEl) {
      if (bundleOutcome === "resolved") {
        stageTagEl.textContent = "✓ 修正済み";
        stageTagEl.className = "dw-group-tag dw-stage-resolved";
      } else {
        stageTagEl.textContent = "正解";
        stageTagEl.className = "dw-group-tag dw-stage-answer";
      }
      stageTagEl.style.display = "";
    }

    let usedCompressed = false;

    if (bundleOutcome === "resolved") {
      // 分岐R：正解の再掲・ゴースト・警告バッジは一切出さない。WHYは全ステップ由来のものを表示する。
      const originalWhy = computeOriginalWhyContent(bundle);
      if (whatEl) whatEl.textContent = "自分で正しく修正できました。";
      if (whyEl) {
        if (originalWhy.whyLines) renderSegmentsInto(whyEl, originalWhy.whyLines);
        else whyEl.textContent = originalWhy.why;
      }
      if (fixEl) fixEl.textContent = "このままで正解です。";
    } else {
      const residualContent = buildResidualDisplayContent(bundle, residuals);
      usedCompressed = residualContent.usedCompressed;
      if (bundleOutcome === "partial") {
        // 分岐P：解消件数を明示し、続けて残存エラーのみの正解表示。WHYは全ステップ由来のもの。
        const prefix = `${before - after}件は修正済みです。残りは次のとおりです：`;
        if (whatEl) {
          if (residualContent.whatLines) {
            renderSegmentsInto(whatEl, [[{ text: prefix, isNode: false }], ...residualContent.whatLines]);
          } else {
            whatEl.textContent = prefix + "\n" + residualContent.what;
          }
        }
        const originalWhy = computeOriginalWhyContent(bundle);
        if (whyEl) {
          if (originalWhy.whyLines) renderSegmentsInto(whyEl, originalWhy.whyLines);
          else whyEl.textContent = originalWhy.why;
        }
      } else {
        // 分岐U：未解消。表示系は現行と同じだが、描画ソースは常に residuals を正とする。
        if (whatEl) {
          if (residualContent.whatLines) renderSegmentsInto(whatEl, residualContent.whatLines);
          else whatEl.textContent = residualContent.what;
        }
        if (whyEl) {
          if (residualContent.whyLines) renderSegmentsInto(whyEl, residualContent.whyLines);
          else whyEl.textContent = residualContent.why;
        }
      }
      if (fixEl) fixEl.textContent = residualContent.fix;
    }

    if (_dwCtx) {
      const { canvasEl, svgEl, labelToId } = _dwCtx;

      canvasEl.querySelectorAll(".node").forEach(el => el.classList.add("diff-dimmed"));
      svgEl.querySelectorAll("g[data-from]").forEach(el => el.classList.add("diff-dimmed"));

      // 解消済み（resolved）は警告バッジ・ゴースト・チップを一切描かない。
      // 一部解消／未解消は残存エラー（residuals）のみに対して描画する。
      if (bundleOutcome !== "resolved") {
        ensureDiffMarker(svgEl);
        for (const err of residuals) applyErrorHighlight(err, _dwCtx);
      }

      for (const label of bundle.involvedLabels) {
        const id = labelToId[label];
        if (!id) continue;
        const el = canvasEl.querySelector(`.node[data-id="${id}"]`);
        if (el) el.classList.remove("diff-dimmed");
      }
      svgEl.querySelectorAll("g[data-from]").forEach(el => {
        if (el.classList.contains("diff-edge-alert")) el.classList.remove("diff-dimmed");
      });

      if (bundle.involvedLabels.length > 0) {
        const firstId = labelToId[bundle.involvedLabels[0]];
        if (firstId) {
          canvasEl.querySelector(`.node[data-id="${firstId}"]`)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    }

    // [adaptive_v1] 編集確定フックからの再描画（silent）はログを発生させない。
    // ステージ進入（hint→answer の初回遷移）でのみ BUNDLE_REVEALED を記録する。
    if (!silent) {
      logOp("BUNDLE_REVEALED", {
        bundleKey: bundle.bundleKey,
        ...(usedCompressed ? { renderMode: "compressed_v2" } : {}),
        disclosureMode: "adaptive_v1",
        bundleOutcome,
        residualCount: after,
        originalCount: before,
      });
      saveToLocalStorage();
    }
  }

  // renderBundleStage: 現在の _dwBundleIndex / _dwStageInBundle に応じてパネルとマップ強調を描画する。
  // bundle内でのステージ遷移（hint→answer）では index を変えずにこの関数だけを呼ぶ。
  // maybeRerenderAnswerStageAfterEdit: マップ編集の確定点（ドラッグ終了・エッジ追加・エッジ削除）
  // から呼ぶ。bundleループの正解ステージを表示中のときだけ、残存エラーを再計算して再描画する
  // （adaptive_v1、2-4）。ヒントステージ中・bundleループ外・概要/完了画面では何もしない
  // （ヒントステージでの自動判定・表示更新は測定を汚染するため絶対に発火させない）。
  // ログは発生させない（silent 再描画）。
  function maybeRerenderAnswerStageAfterEdit() {
    if (state.phase !== PHASE.ACUTE_DIFF && state.phase !== PHASE.ACUTE_LAYER_DIFF) return;
    if (_dwBundleIndex < 0 || _dwBundleIndex >= _dwBundles.length) return;
    if (_dwStageInBundle !== "answer") return;
    renderBundleStage({ silent: true });
  }

  // renderBundleStage: opts.silent=true のときは正解ステージの再描画であっても
  // BUNDLE_REVEALED をログしない（adaptive_v1：編集確定フックからの再描画専用）。
  function renderBundleStage(opts) {
    const N       = _dwBundles.length;
    const safeIdx = _dwBundleIndex;

    refreshDwCtxLiveArrays();
    clearWalkthroughHighlights();

    const counterEl  = $("dwCounter");
    const groupTagEl = $("dwGroupTag");
    const stageTagEl = $("dwStageTag");
    const whatEl     = $("dwWhat");
    const whyEl      = $("dwWhy");
    const fixEl      = $("dwFix");
    const prevBtn    = $("dwPrev");
    const nextBtn    = $("dwNext");

    counterEl?.classList.remove("dw-intro-mode");
    if (stageTagEl) { stageTagEl.style.display = "none"; stageTagEl.className = "dw-group-tag"; }
    if (nextBtn) nextBtn.textContent = "次へ →";

    // ── ゼロ件 ────────────────────────────────────────────────────
    // [ADDED flow-v2補修] bundleが0件のときはこの早期returnが完了分岐（safeIdx >= N）を
    // 経由しないため、ここでも完走フラグを立てる（さもないと誤り0件の学習者が退出ボタンに
    // 永久にゲートされる）。表示内容・disabled制御は無変更。
    if (N === 0) {
      _dwReachedComplete = true;
      $("btnDiffNext")?.classList.remove("btn-gated");

      if (counterEl)  counterEl.textContent  = "採点結果";
      if (groupTagEl) { groupTagEl.textContent = ""; groupTagEl.style.display = "none"; }
      if (whatEl) whatEl.textContent = _dwStage === "layer"
        ? "レイヤー配置に修正ポイントはありません。よくできています。"
        : "関係（矢印）に修正ポイントはありません。よくできています。";
      if (whyEl)  whyEl.textContent  = "";
      if (fixEl)  fixEl.textContent  = "";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    const errorCount = _dwErrors.length;

    // ── 概要（index = -1）────────────────────────────────────────
    if (safeIdx === -1) {
      if (counterEl)  counterEl.textContent = `全 ${errorCount} 件`;
      if (groupTagEl) { groupTagEl.textContent = ""; groupTagEl.style.display = "none"; }
      if (whatEl) whatEl.textContent = _dwStage === "layer"
        ? `あなたのレイヤー配置には ${errorCount} 件の修正ポイントがあります。`
        : `あなたのマップの関係（矢印）には ${errorCount} 件の修正ポイントがあります。`;
      const countsByGroup  = {};
      const labelByGroup   = {};
      for (const s of _dwSteps) {
        countsByGroup[s.groupKey]  = (countsByGroup[s.groupKey]  || 0) + 1;
        labelByGroup[s.groupKey]   = s.groupLabel;
      }
      const ORDER = ["layer", "command", "hub", "support_origin", "support"];
      const breakdown = ORDER.filter(g => countsByGroup[g])
        .map(g => `${labelByGroup[g]} ${countsByGroup[g]}件`).join(" ／ ");
      if (whyEl) whyEl.textContent = breakdown;
      if (fixEl) fixEl.textContent = "「次へ」を押して、1件ずつ確認しましょう。";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = false;
      return;
    }

    // ── 完了（index = N）─────────────────────────────────────────
    // [CHANGED flow-v2] 旧 Phase 11 最終確認（showAcuteReviseSummary）をここに統合。
    // walkthrough構築時点の _dwErrors ではなく、描画のたびにログ無音で再採点した現在の
    // 残存エラーを使う（adaptive_v1と同種の鮮度問題への対応）。edge側は元のbundle群に
    // 存在しなかった新規カテゴリのエラーもここで初めて捕捉する（唯一の捕捉点）。
    if (safeIdx >= N) {
      // [ADDED flow-v2補修] 完了画面到達＝完走フラグを立てる。退出ボタンのゲート解除。
      _dwReachedComplete = true;
      $("btnDiffNext")?.classList.remove("btn-gated");

      if (counterEl)  counterEl.textContent  = "確認完了";
      if (groupTagEl) { groupTagEl.textContent = ""; groupTagEl.style.display = "none"; }
      if (prevBtn) prevBtn.disabled = false;
      if (nextBtn) nextBtn.disabled = true;

      let residualErrors = _dwErrors;
      if (window.__ICS_SCORING__ && window.idealMapAcute) {
        const { normalizeMap, gradeAcuteMap } = window.__ICS_SCORING__;
        const result = gradeAcuteMap(
          normalizeMap({ nodes: state.nodes, edges: state.edges }),
          normalizeMap(window.idealMapAcute)
        );
        residualErrors = _dwStage === "layer"
          ? result.errors.filter(e => e.category === "layer_mismatch")
          : result.errors.filter(e => e.category !== "layer_mismatch");
      }
      const residualCategories = {};
      for (const e of residualErrors) residualCategories[e.category] = (residualCategories[e.category] || 0) + 1;

      if (residualErrors.length === 0) {
        if (whatEl) whatEl.textContent = "すべての修正ポイントを解消できました。";
        if (whyEl)  whyEl.textContent  = "";
        if (fixEl)  fixEl.textContent  = "";
      } else {
        if (whatEl) whatEl.textContent = `未解消の修正ポイントが ${residualErrors.length} 件あります。`;
        if (whyEl)  whyEl.textContent  = "";
        if (fixEl)  fixEl.textContent  = _dwStage === "layer"
          ? "このまま進むと、残りは正解の層に確定されます。"
          : "このままの内容で比較・分析へ進みます。";
      }

      // 全誤りを一括表示：ノード警告＋既存エッジ警告のみ（不足ゴーストは描かない）。
      // 再採点結果（residualErrors）に対して適用する（_dwErrors ではない）。
      if (_dwCtx && residualErrors.length > 0) {
        ensureDiffMarker(_dwCtx.svgEl);
        const noGhostCtx = { ..._dwCtx, noGhost: true };
        for (const err of residualErrors) {
          applyErrorHighlight(err, noGhostCtx);
        }
      }
      logOp("DIFF_WALKTHROUGH_COMPLETE", {
        stepCount: N, errorCount,
        residualCount: residualErrors.length, // [ADDED flow-v2]
        residualCategories,                   // [ADDED flow-v2]
      });
      saveToLocalStorage();
      return;
    }

    // ── bundle（0..N-1）───────────────────────────────────────────
    const bundle = _dwBundles[safeIdx];
    const els = { counterEl, groupTagEl, stageTagEl, whatEl, whyEl, fixEl, prevBtn, nextBtn };
    if (_dwStageInBundle === "hint") {
      renderHintStage(bundle, safeIdx, N, els);
    } else {
      renderAnswerStage(bundle, safeIdx, N, els, opts);
    }
  }

  // showBundleStep: bundleループのナビゲーション。index: -1=概要, 0..N-1=bundle, N=完了。
  // bundle に入る際は常にヒントステージから開始する。
  function showBundleStep(index, direction) {
    const N       = _dwBundles.length;
    const safeIdx = Math.max(-1, Math.min(N, index));
    _dwBundleIndex   = safeIdx;
    _dwStageInBundle = "hint";

    if (safeIdx === -1) {
      logOp("DIFF_WALKTHROUGH_STEP", { index: -1, stepType: "overview", category: null, groupKey: null, involvedLabels: [], direction });
    } else if (safeIdx < N) {
      const b = _dwBundles[safeIdx];
      logOp("DIFF_WALKTHROUGH_STEP", {
        index: safeIdx, stepType: "hint", category: b.category, groupKey: b.groupKey,
        involvedLabels: b.involvedLabels, direction,
      });
    }
    saveToLocalStorage();

    renderBundleStage();
  }

  // initBundleLoop: ACUTE_DIFF / ACUTE_LAYER_DIFF エントリ時に呼ぶ。bundleを生成して概要を表示する。
  // errors: 表示対象のエラー配列。stage: "layer"（フェーズ12）| "edge"（フェーズ10）。
  function initBundleLoop(errors, stage) {
    _dwStage = stage;

    const canvasEl     = $("canvas-diff");
    const svgEl        = $("svgLayer-diff");
    const canvasWrapEl = $("canvasWrap-diff");
    const labelToId    = buildLabelToIdMap(state.nodes);

    _dwCtx = { canvasEl, svgEl, labelToId, learnNodes: state.nodes, learnEdges: state.edges, canvasWrapEl };

    _dwErrors = errors || [];
    const idealNodes = (mapLoadStatus.idealAcute === "ready" && window.idealMapAcute)
      ? window.idealMapAcute.nodes : [];

    _dwSteps = buildWalkthroughSteps(_dwErrors, idealNodes);
    _dwBundles = buildBundles(_dwSteps);
    _dwBundleIndex = -1;
    _dwStageInBundle = "hint";
    _dwBundleBefore = {};
    // [ADDED flow-v2補修] 再入場のたびに完走フラグをリセット（意図した設計：リロード後の
    // フレッシュな完了画面再採点を全員に通す）。ボタンの減光表示も合わせて再付与する。
    _dwReachedComplete = false;
    $("btnDiffNext")?.classList.add("btn-gated");

    const countsByGroup = {};
    for (const s of _dwSteps) countsByGroup[s.groupKey] = (countsByGroup[s.groupKey] || 0) + 1;
    logOp("DIFF_WALKTHROUGH_INIT", {
      stepCount:   _dwSteps.length,
      errorCount:  _dwSteps.length,
      bundleCount: _dwBundles.length,
      countsByGroup,
      stage: _dwStage,
    });
    saveToLocalStorage();

    ensureDiffMarker(svgEl);
    showBundleStep(-1, "next");
  }

  // ================================================================
  // buildROEdgeGroup: 1エッジ分の SVG グループを構築して返す（appendは呼び出し側）。
  // 座標は offsetLeft/offsetTop ベース（CSS transform の影響を受けないコンテンツ座標）。
  // renderReadOnlyMap のエッジループと drawGhostEdge が共用する。
  // ================================================================
  function buildROEdgeGroup(e, nodes, allEdges, ctx) {
    const { canvasEl, canvasWrapEl, markerSuffix } = ctx;

    const from = nodes.find(n => n.id === e.from);
    const to   = nodes.find(n => n.id === e.to);
    if (!from || !to) return null;

    // offset ベース中心座標（CSS transform に依存しない）
    const getCenterRO = (node) => {
      const el = canvasEl.querySelector(`.node[data-id="${node.id}"]`);
      if (!el) return { x: node.x + 75, y: node.y + 28 };
      return {
        x: el.offsetLeft + el.offsetWidth  / 2,
        y: el.offsetTop  + el.offsetHeight / 2,
      };
    };

    const typeInfo = EDGE_MAP[e.label] || EDGE_TYPES[0];
    const col      = typeInfo.stroke;
    const a = getCenterRO(from);
    const b = getCenterRO(to);
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
    const shorten = 26;
    const ex = b.x - (dx/dist)*shorten;
    const ey = b.y - (dy/dist)*shorten;

    const hasReverse = allEdges.some(r =>
      r.id !== e.id && r.from === e.to && r.to === e.from
    );

    let pathD, lx, ly;
    const CURVE_OFFSET = 50;

    if (hasReverse) {
      const sign = e.from < e.to ? 1 : -1;
      const canonFrom = e.from < e.to ? from : to;
      const canonTo   = e.from < e.to ? to   : from;
      const ca = getCenterRO(canonFrom);
      const cb = getCenterRO(canonTo);
      const cdx = cb.x - ca.x, cdy = cb.y - ca.y;
      const cdist = Math.sqrt(cdx*cdx + cdy*cdy) || 1;
      const cnx = -cdy / cdist, cny = cdx / cdist;
      const sx = a.x + (dx/dist)*shorten;
      const sy = a.y + (dy/dist)*shorten;
      const cpx = (sx + ex) / 2 + sign * CURVE_OFFSET * cnx;
      const cpy = (sy + ey) / 2 + sign * CURVE_OFFSET * cny;
      pathD = `M ${sx} ${sy} Q ${cpx} ${cpy} ${ex} ${ey}`;
      lx = (sx + 2*cpx + ex)/4;
      ly = (sy + 2*cpy + ey)/4;
    } else if (e.bidirectional) {
      const sx = a.x + (dx/dist)*shorten;
      const sy = a.y + (dy/dist)*shorten;
      pathD = `M ${sx} ${sy} L ${ex} ${ey}`;
      lx = (a.x+b.x)/2; ly = (a.y+b.y)/2;
    } else {
      pathD = `M ${a.x} ${a.y} L ${ex} ${ey}`;
      lx = (a.x+b.x)/2; ly = (a.y+b.y)/2;
    }

    const markerKey = col === "#ff6b6b" ? "red"
                    : col === "#4d8fff" ? "blue"
                    : col === "#c084fc" ? "purple" : "teal";
    const markerEnd   = `url(#arrow-${markerKey}${markerSuffix})`;
    const markerStart = e.bidirectional ? markerEnd : "none";

    const g = document.createElementNS("http://www.w3.org/2000/svg","g");
    g.dataset.from = e.from; g.dataset.to = e.to;

    const path = document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d", pathD);
    path.setAttribute("stroke", col);
    path.setAttribute("stroke-width", "2.2");
    path.setAttribute("fill", "none");
    path.setAttribute("marker-end", markerEnd);
    if (e.bidirectional) path.setAttribute("marker-start", markerStart);
    path.setAttribute("opacity", "0.88");
    g.appendChild(path);

    const labelW = (e.label?.length || 0) * 8 + 12;
    const bg = document.createElementNS("http://www.w3.org/2000/svg","rect");
    bg.setAttribute("x", lx-labelW/2); bg.setAttribute("y", ly-11);
    bg.setAttribute("width", labelW);  bg.setAttribute("height", 16);
    bg.setAttribute("rx", 5); bg.setAttribute("fill","#0d1422");
    bg.setAttribute("opacity","0.9");
    g.appendChild(bg);

    const txt = document.createElementNS("http://www.w3.org/2000/svg","text");
    txt.setAttribute("x", lx); txt.setAttribute("y", ly-2);
    txt.setAttribute("class","edge-label-text");
    txt.setAttribute("fill", col);
    txt.textContent = e.label || "";
    g.appendChild(txt);

    return g;
  }

  // ================================================================
  /**
   * 読み取り専用マップを指定キャンバスに描画する
   * @param {Array}       nodes        - 描画するノード配列
   * @param {Array}       edges        - 描画するエッジ配列
   * @param {HTMLElement} canvasEl     - ノードを配置するdiv
   * @param {SVGElement}  svgEl        - エッジを描画するSVG
   * @param {HTMLElement} canvasWrapEl - canvasWrap要素
   * @param {HTMLElement} statEl       - ノード数表示用span（nullも可）
   * @param {string}      markerSuffix - マーカーID用サフィックス（例: "-ideal"）
   */
  function renderReadOnlyMap(nodes, edges,
      canvasEl, svgEl, canvasWrapEl, statEl, markerSuffix,
      onNodeClick = null, fitToWrap = false,
      onNodeDblClick = null) {

    // 前回の fitToWrap transform が残っている場合に備えてリセット
    canvasEl.style.transform = "";
    canvasEl.style.transformOrigin = "";
    svgEl.style.transform = "";
    svgEl.style.transformOrigin = "";

    // ノード描画
    let roHighlightId = null;
    canvasEl.innerHTML = "";
    for (const n of nodes) {
      const div = document.createElement("div");
      const layerClass = n.layerId ? `layer-${n.layerId}` : "layer-none";
      // beneficiary 判定は label ベースに統一（renderNodes と同じ BENEFICIARY_LABELS を参照）
      // group クラスは class に含めない（内部メタデータ）
      const benefClass = BENEFICIARY_LABELS.has(n.label) ? " node-beneficiary" : "";
      div.className = `node ${layerClass}${benefClass}`;
      div.dataset.id = n.id;
      div.style.left = n.x + "px";
      div.style.top  = n.y + "px";
      div.innerHTML  = `<div class="ntitle">${esc(n.label)}</div>`;
      div.addEventListener("click", e => {
        e.stopPropagation();
        if (onNodeClick) onNodeClick(n.id, n.label);
      });
      div.addEventListener("dblclick", e => {
        e.stopPropagation();
        clearTimeout(_clickTimer);
        if (roHighlightId === n.id) {
          roHighlightId = null;
          clearHighlightRO(canvasEl, svgEl);
        } else {
          roHighlightId = n.id;
          onNodeDblClick?.();
          applyHighlightRO(n.id, nodes, edges, canvasEl, svgEl);
        }
      });
      if (state.phase === PHASE.RECOVERY_PREP) {
        div.addEventListener("mouseenter", () => showNodeTooltip(n.label, div, "p5NodeTooltip"));
        div.addEventListener("mouseleave", () => hideNodeTooltip("p5NodeTooltip"));
      }
      canvasEl.appendChild(div);
    }

    // 背景クリックでハイライト解除
    canvasWrapEl.addEventListener("click", () => {
      if (roHighlightId !== null) {
        roHighlightId = null;
        clearHighlightRO(canvasEl, svgEl);
      }
    });

    // エッジ描画は1フレーム後（レイアウト確定後）に実行
    requestAnimationFrame(() => {
      const defs = svgEl.querySelector("defs");
      svgEl.innerHTML = "";
      if (defs) svgEl.appendChild(defs);

      for (const e of edges) {
        const g = buildROEdgeGroup(e, nodes, edges, { canvasEl, svgEl, canvasWrapEl, markerSuffix });
        if (g) svgEl.appendChild(g);
      }

      // ノード数・矢印数の表示
      if (statEl) {
        statEl.textContent = `ノード: ${nodes.length} ／ 矢印: ${edges.length}`;
      }

      // フィット表示（Phase3のみ）
      if (fitToWrap && nodes.length > 0) {
        const xs = nodes.map(n => n.x);
        const ys = nodes.map(n => n.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs) + 180;
        const maxY = Math.max(...ys) + 56;
        const contentW = maxX - minX;
        const contentH = maxY - minY;

        const wrapRect = canvasWrapEl.getBoundingClientRect();
        const scaleX = wrapRect.width  / contentW;
        const scaleY = wrapRect.height / contentH;
        const scale  = Math.min(scaleX, scaleY, 1) * 0.88;

        const tx = -minX * scale + (wrapRect.width  - contentW * scale) / 2;
        const ty = -minY * scale + (wrapRect.height - contentH * scale) / 2;

        const transform       = `translate(${tx}px, ${ty}px) scale(${scale})`;
        const transformOrigin = "top left";

        canvasEl.style.transform       = transform;
        canvasEl.style.transformOrigin = transformOrigin;
        svgEl.style.transform          = transform;
        svgEl.style.transformOrigin    = transformOrigin;
      }
    });
  }

  // ================================================================
  // PHASE 5 — READ-ONLY MAP & REMOVAL CANDIDATE LOGIC
  // ================================================================
  function renderPhase5Map() {
    if (mapLoadStatus.idealAcute !== "ready") {
      if (canvasEl) canvasEl.innerHTML = mapLoadStatus.idealAcute === "error"
        ? '<div style="color:var(--red);padding:20px;font-size:14px;">⚠ 理想マップの読み込みに失敗しました</div>'
        : '<div style="color:var(--text-dim);padding:20px;font-size:14px;">読み込み中…</div>';
      return;
    }
    state.nodes           = window.idealMapAcute.nodes.map(n => ({ ...n }));
    state.edges           = window.idealMapAcute.edges.map(e => ({ ...e }));
    state.selectedNodeId  = null;
    state.selectedEdgeId  = null;
    state.highlightNodeId = null;

    renderReadOnlyMap(
      state.nodes, state.edges,
      canvasEl, svgEl, canvasWrap,
      activeCanvasStatEl, activeMarkerSuffix,
      toggleRemovalCandidate
    );
    // DOM 再構築後、保存済み削除候補のクラスを復元する
    window.phase5Data.removals.forEach(r => {
      canvasEl?.querySelector(`.node[data-id="${r.nodeId}"]`)
        ?.classList.add("node-removal-candidate");
    });
    renderRemovalList();
    updatePhase6Btn();
  }

  function toggleRemovalCandidate(_nodeId, label) {
    // Phase6 が初期化済みの場合、削除候補の変更により phaseData.p6 が無効になる。
    // ・hasP6Edits() が true（ユーザーが編集済み）のときのみ confirm で確認する
    // ・confirm キャンセルならトグル自体を中断する
    // ・confirm 通過（または編集なし）なら invalidatePhase6() で Phase6 を無効化する
    if (phase6Initialized) {
      if (hasP6Edits()) {
        if (!confirm("削除候補を変更すると、復旧期マップの編集内容がリセットされます。続けますか？")) {
          return;
        }
      }
      // 削除候補が変わるため Phase6 を無効化する。
      // 次回 switchPhase(RECOVERY_MAP) → p6NeedsRebuild()=true で再構築される。
      invalidatePhase6();
      logOp("INVALIDATE_PHASE6", { reason: "removal_candidate_changed" });
    }

    const alreadySelected = window.phase5Data.removals.some(r => r.label === label);

    if (alreadySelected) {
      // 同一ラベルのエントリをすべて削除
      window.phase5Data.removals =
        window.phase5Data.removals.filter(r => r.label !== label);
      // 同一ラベルの全ノードからクラスを除去
      state.nodes
        .filter(n => n.label === label)
        .forEach(n => {
          canvasEl?.querySelector(`.node[data-id="${n.id}"]`)
            ?.classList.remove("node-removal-candidate");
        });
      logOp("REMOVE_CANDIDATE_REMOVE", { nodeId: _nodeId, label, removalCount: window.phase5Data.removals.length });
    } else {
      // 同一ラベルの全ノードをまとめて追加（重複防止あり）
      state.nodes
        .filter(n => n.label === label)
        .forEach(n => {
          if (!window.phase5Data.removals.some(r => r.nodeId === n.id)) {
            window.phase5Data.removals.push({ nodeId: n.id, label: n.label, reason: "" });
          }
          canvasEl?.querySelector(`.node[data-id="${n.id}"]`)
            ?.classList.add("node-removal-candidate");
        });
      logOp("REMOVE_CANDIDATE_ADD", { nodeId: _nodeId, label, removalCount: window.phase5Data.removals.length });
    }

    renderRemovalList();
    updatePhase6Btn();
  }

  function renderRemovalList() {
    const listEl = $("p5RemovalList");
    if (!listEl) return;
    const { removals } = window.phase5Data;
    if (removals.length === 0) {
      listEl.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">（まだ選択されていません）</span>';
      return;
    }
    // ラベルで重複排除（先頭エントリを代表として使用）
    const uniqueRemovals = Object.values(
      removals.reduce((acc, r) => {
        if (!acc[r.label]) acc[r.label] = r;
        return acc;
      }, {})
    );
    // [CHANGED] per-node の理由入力欄を削除し、ラベル表示のみとする
    listEl.innerHTML = uniqueRemovals.map((r) => `
      <div class="removal-item" data-label="${esc(r.label)}">
        <div class="removal-item-label">🗑 ${esc(r.label)}</div>
      </div>
    `).join("");
  }

  // [ADDED] 判断方針 textarea の初期化と input ハンドラ登録
  // renderPhase5Map() 末尾から呼ぶ。重複登録防止のため cloneNode + replaceWith パターンを使用。
  function initPolicyRationaleInput() {
    const ta = $("p5PolicyRationale");
    const counter = $("p5PolicyCount");
    if (!ta) return;
    ta.value = window.phase5Data.policyRationale || "";
    if (counter) counter.textContent = String(ta.value.length);
    const fresh = ta.cloneNode(true);
    fresh.value = ta.value;
    ta.replaceWith(fresh);
    fresh.addEventListener("input", () => {
      window.phase5Data.policyRationale = fresh.value;
      if (counter) counter.textContent = String(fresh.value.length);
      debouncedSave();
    });
  }

  function updatePhase6Btn() {
    const btn  = $("btnToPhase6");
    const hint = $("btnToPhase6Hint");
    if (!btn) return;
    const has = window.phase5Data.removals.length > 0;
    btn.disabled = !has;
    if (hint) hint.style.display = has ? "none" : "block";
  }

  window.goToPhase6 = function() { switchPhase(PHASE.RECOVERY_MAP); };

  // ================================================================
  // PHASE 6 — CANVAS INITIALISATION
  // ================================================================
  function initPhase6Canvas() {
    if (mapLoadStatus.idealAcute !== "ready") return;
    const removedIds = new Set(window.phase5Data.removals.map(r => r.nodeId));

    // 旧ID → 新ID のマッピング（canvas-p5 との data-id 重複を解消）
    const idMap = new Map();
    window.idealMapAcute.nodes
      .filter(n => !removedIds.has(n.id))
      .forEach(n => idMap.set(n.id, "n-" + uid()));

    phaseData.p6.nodes = window.idealMapAcute.nodes
      .filter(n => !removedIds.has(n.id))
      .map(n => {
        const isBenef = PHASE6_BENEFICIARY_LABELS.has(n.label);
        // 被支援者の引き継ぎ y が層外なら第4層中央に補正（理想マップ作成者の意図を尊重する保守的実装）
        const y = (isBenef && getLayerIdFromY(n.y) !== 4)
          ? getCenterYForLayer(4)
          : n.y;
        return {
          id:          idMap.get(n.id),
          label:       n.label,
          group:       n.group,
          x:           n.x,
          y,
          layerId:     isBenef ? 4 : null,
          layerReason: "",
          isInitial:   true,
        };
      });

    // 急性期理想マップから継承されなかった復旧期固有の被支援者ノードを補完配置
    const placedLabels = new Set(phaseData.p6.nodes.map(n => n.label));
    const missingBeneficiaries = [...PHASE6_BENEFICIARY_LABELS]
      .filter(label => !placedLabels.has(label));

    if (missingBeneficiaries.length > 0) {
      const rect = canvasWrap?.getBoundingClientRect();
      const w = (rect && rect.width) || 1000;
      const yPos = getCenterYForLayer(4);
      const spacing = w / (missingBeneficiaries.length + 1);
      missingBeneficiaries.forEach((label, i) => {
        phaseData.p6.nodes.push({
          id:          "n-" + uid(),
          label,
          group:       "g-team",
          x:           Math.round(spacing * (i + 1) - 75),
          y:           yPos,
          layerId:     4,
          layerReason: "",
          isInitial:   true,
        });
      });
    }

    phaseData.p6.edges = [];

    phaseData.p6.answers = { q1: "", q2: "" };
    phaseData.p6.log     = [];
    // initPhase6Canvas() は Phase6 の「初期状態を作る」唯一の責務を持つ。
    // 呼び出し後は phase6Initialized=true + シグネチャが揃い、p6NeedsRebuild()=false になる。
    phase6Initialized      = true;
    phase6RemovalSignature = getRemovalSignature();
    logOp("INIT_PHASE6", { nodeCount: phaseData.p6.nodes.length });
  }

  // ================================================================
  // ================================================================
  // ICS原則 選択表示ヘルパー
  // ================================================================
  const ICS_PRINCIPLE_JA = {
    "Unity of Command": "指揮一元化",
    "Span of Control":  "統制範囲",
    "Communications":   "コミュニケーション",
    "該当なし":          "3原則のいずれにも該当しない",
  };

  function renderSelectedPrinciple(elementId, value, fallbackMsg) {
    const el = $(elementId);
    if (!el) return;
    if (!value) {
      el.innerHTML = `<span style="font-size:11px;color:var(--text-muted);">${esc(fallbackMsg || "（未選択）")}</span>`;
      return;
    }
    if (value === "該当なし") {
      el.innerHTML = `
        <div class="ar-principle-chip ar-principle-chip-na">
          <span class="ar-principle-ja">3原則のいずれにも該当しない</span>
        </div>
      `;
      return;
    }
    const ja = ICS_PRINCIPLE_JA[value] || "";
    el.innerHTML = `
      <div class="ar-principle-chip">
        <span class="ar-principle-en">${esc(value)}</span>
        <span class="ar-principle-ja">${esc(ja)}</span>
      </div>
    `;
  }

  // ACUTE_RECORD フェーズ レンダラー [ADDED]
  // ================================================================

  /**
   * 問3 用ラジオ選択肢 HTML を返す（excerpts 配列から自動生成）
   * @param {Object} q - ACUTE_RECORD_CONTENT.questions の問オブジェクト
   * @param {Array}  excerpts - ACUTE_RECORD_CONTENT.excerpts
   * @returns {string} HTML 文字列
   */
  function renderSingleChoiceQuestion(q) {
    return `
      <div class="ar-question-block" id="arQBlock-${esc(q.id)}">
        <div class="compare-qa-label" id="arQ4Label">${esc(q.label)}</div>
        <div class="ar-question-hint">上の記録文をクリックして1つ選択してください。</div>
      </div>
    `;
  }

  /**
   * 問4 用テキストエリア HTML を返す
   * @param {Object} q - ACUTE_RECORD_CONTENT.questions の問オブジェクト
   * @returns {string} HTML 文字列
   */
  function renderTextareaQuestion(q) {
    // FIXME: textarea 問題が将来複数になる場合は question.id ベースで ID を動的生成すること。
    //        現状は1問固定前提でハードコードしている。
    return `
      <div class="ar-question-block" id="arQBlock-${esc(q.id)}">
        <div class="compare-qa-label">${esc(q.label)}</div>
        <textarea id="arQ5Answer" rows="3"
          placeholder="${esc(q.placeholder || "")}"
          maxlength="${q.maxLength || 500}"></textarea>
        <div class="char-count"><span id="arQ5CharCount">0</span> / ${q.maxLength || 500} 字</div>
      </div>
    `;
  }

  /**
   * ACUTE_RECORD フェーズの画面を描画し、フォームイベントを attach する。
   * wireEvents() には追加しない（DOM が動的生成のため）。
   */
  function renderAcuteRecordView() {
    const excerptList = $("arExcerptList");
    const questionArea = $("arQuestionArea");
    if (!excerptList || !questionArea) return;

    const { excerpts, questions } = ACUTE_RECORD_CONTENT;
    const skippedQ4 = phaseData.acute.answers.p3q2sel === "該当なし";
    if (skippedQ4 && phaseData.acuteRecord.answers.q4 !== "") {
      phaseData.acuteRecord.answers.q4 = "";
      saveToLocalStorage();
    }
    if (skippedQ4) logOp("Q4_SKIPPED", { reason: "p3q2sel=該当なし" });

    // (a) 抜粋エリア描画（カード本体がラジオグループとして機能する）
    excerptList.setAttribute("role", "radiogroup");
    excerptList.setAttribute("aria-labelledby", "arQ4Label");
    excerptList.innerHTML = excerpts.map(ex => {
      const disabled = ex.disabled === true;
      return `
        <div class="ar-excerpt-card"
             data-id="${esc(ex.id)}"
             id="arCard-${esc(ex.id)}"
             role="radio"
             tabindex="${disabled ? "-1" : "0"}"
             aria-checked="false"
             ${disabled ? 'aria-disabled="true"' : ""}>
          <span class="ar-excerpt-num">${esc(ex.id)}</span>
          <div class="ar-excerpt-text">${esc(ex.text)}</div>
        </div>
      `;
    }).join("");

    // (b) 設問エリア描画
    questionArea.innerHTML = questions.map(q => {
      if (q.kind === "singleChoice") {
        if (skippedQ4) return `
          <div class="ar-question-block ar-question-skipped" id="arQBlock-${esc(q.id)}">
            <div class="compare-qa-label">${esc(q.label)}</div>
            <div class="ar-skip-notice">問2で「該当なし」を選択したため、この設問はスキップされます。</div>
          </div>`;
        return renderSingleChoiceQuestion(q);
      }
      if (q.kind === "textarea") return renderTextareaQuestion(q);
      return "";
    }).join("");

    // (c) イベント attach — カードクリック／キーボード選択
    if (!skippedQ4) {
      const handleSelect = ex => {
        if (ex.disabled) return;
        phaseData.acuteRecord.answers.q4 = ex.id;
        excerptList.querySelectorAll(".ar-excerpt-card").forEach(c => {
          const sel = c.dataset.id === ex.id;
          c.classList.toggle("selected", sel);
          c.setAttribute("aria-checked", sel ? "true" : "false");
        });
        logOp("ANSWER_SELECT", { questionId: "acuteRecord.q4", value: ex.id });
        saveToLocalStorage();
      };
      excerpts.forEach(ex => {
        const cardEl = $(`arCard-${ex.id}`);
        if (!cardEl) return;
        cardEl.addEventListener("click", () => handleSelect(ex));
        cardEl.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(ex); }
        });
      });
    }

    // (c) イベント attach — q5 テキストエリア（文字数カウント付き）
    const q5ta = $("arQ5Answer");
    if (q5ta) {
      const q5State = { started: false, editCount: 0, maxLengthReached: 0 };
      q5ta.addEventListener("focus", () => {
        if (!q5State.started) {
          q5State.started = true;
          q5State.editCount = 0;
          q5State.maxLengthReached = q5ta.value.length;
          logOp("ANSWER_START", { questionId: "acuteRecord.q5" });
        }
      });
      q5ta.addEventListener("input", () => {
        const len = q5ta.value.length;
        const cc  = $("arQ5CharCount");
        if (cc) {
          cc.textContent = len;
          const max = ACUTE_RECORD_CONTENT.questions.find(q => q.id === "q5")?.maxLength || 200;
          cc.parentElement.className =
            "char-count" + (len > max ? " over" : len >= max * 0.9 ? " warn" : "");
          if (len > max) {
            q5ta.classList.add("over");
          } else {
            q5ta.classList.remove("over");
          }
        }
        q5State.editCount += 1;
        q5State.maxLengthReached = Math.max(q5State.maxLengthReached, q5ta.value.length);
        phaseData.acuteRecord.answers.q5 = q5ta.value;
        debouncedSave();
      });
      q5ta.addEventListener("blur", () => {
        if (q5State.editCount === 0) return;
        logOp("ANSWER_CHANGE", {
          questionId: "acuteRecord.q5",
          valueLength: q5ta.value.length,
          editCount: q5State.editCount,
          maxLengthReached: q5State.maxLengthReached
        });
        q5State.editCount = 0;
      });
    }

    // 「復旧期準備へ進む」ボタン（バリデーション付き）
    const btnToRecoveryPrep = $("btnToRecoveryPrep");
    if (btnToRecoveryPrep) {
      // 重複イベント防止のためクローン置き換え
      const fresh = btnToRecoveryPrep.cloneNode(true);
      btnToRecoveryPrep.replaceWith(fresh);
      fresh.addEventListener("click", () => {
        const { q4, q5 } = phaseData.acuteRecord.answers;
        if (!skippedQ4 && !q4) {
          showToast("問3で対応検証記録の番号を選択してください", 3000);
          return;
        }
        if (!q5) {
          if (!confirm("問4が未入力です。このまま進みますか？")) return;
        }
        switchPhase(PHASE.RECOVERY_PREP);
      });
    }
  }

  /**
   * phaseData.acuteRecord.answers の値を各フォーム要素に復元する。
   * renderAcuteRecordView() の DOM 生成後に呼ぶこと。
   */
  function restoreAcuteRecordAnswers() {
    const { q4, q5 } = phaseData.acuteRecord.answers;
    const excerptList = $("arExcerptList");

    // q4 復元
    if (q4) {
      excerptList?.querySelectorAll(".ar-excerpt-card").forEach(card => {
        const sel = card.dataset.id === q4;
        card.classList.toggle("selected", sel);
        card.setAttribute("aria-checked", sel ? "true" : "false");
      });
    }

    // q5 復元
    const q5ta = $("arQ5Answer");
    if (q5ta && q5) {
      q5ta.value = q5;
      const cc = $("arQ5CharCount");
      if (cc) {
        cc.textContent = q5.length;
        const max = ACUTE_RECORD_CONTENT.questions.find(q => q.id === "q5")?.maxLength || 200;
        cc.parentElement.className =
          "char-count" + (q5.length > max ? " over" : q5.length >= max * 0.9 ? " warn" : "");
      }
    }
  }

  // ================================================================
  // RECOVERY_RECORD フェーズ レンダラー
  // ================================================================

  function renderRecoveryRecordView() {
    const questionArea = $("rrQuestionArea");
    if (!questionArea) return;

    const { questions } = RECOVERY_RECORD_CONTENT;

    // 設問エリア描画（textarea のみ）
    questionArea.innerHTML = questions.map(q => {
      if (q.kind === "textarea") {
        return `
          <div class="ar-question-block" id="rrQBlock-${esc(q.id)}">
            <div class="compare-qa-label">${esc(q.label)}</div>
            <textarea id="rrQ9Answer" rows="3"
              placeholder="${esc(q.placeholder || "")}"
              maxlength="${q.maxLength || 500}"></textarea>
            <div class="char-count"><span id="rrQ9CharCount">0</span> / ${q.maxLength || 500} 字</div>
          </div>
        `;
      }
      return "";
    }).join("");

    // イベント attach — q9 テキストエリア
    const q9ta = $("rrQ9Answer");
    if (q9ta) {
      const q9State = { started: false, editCount: 0, maxLengthReached: 0 };
      q9ta.addEventListener("focus", () => {
        if (!q9State.started) {
          q9State.started = true;
          q9State.editCount = 0;
          q9State.maxLengthReached = q9ta.value.length;
          logOp("ANSWER_START", { questionId: "recoveryRecord.q9" });
        }
      });
      q9ta.addEventListener("input", () => {
        const len = q9ta.value.length;
        const cc  = $("rrQ9CharCount");
        if (cc) {
          cc.textContent = len;
          const max = RECOVERY_RECORD_CONTENT.questions.find(q => q.id === "q9")?.maxLength || 200;
          cc.parentElement.className =
            "char-count" + (len > max ? " over" : len >= max * 0.9 ? " warn" : "");
          q9ta.classList.toggle("over", len > max);
        }
        q9State.editCount += 1;
        q9State.maxLengthReached = Math.max(q9State.maxLengthReached, q9ta.value.length);
        phaseData.recoveryRecord.answers.q9 = q9ta.value;
        debouncedSave();
      });
      q9ta.addEventListener("blur", () => {
        if (q9State.editCount === 0) return;
        logOp("ANSWER_CHANGE", {
          questionId: "recoveryRecord.q9",
          valueLength: q9ta.value.length,
          editCount: q9State.editCount,
          maxLengthReached: q9State.maxLengthReached
        });
        q9State.editCount = 0;
      });
    }

    // 「シーケンス図へ進む」ボタン
    const btnToSeq = $("btnToSequenceFromRR");
    if (btnToSeq) {
      if (!FEATURES.ENABLE_SEQUENCE_PHASE) {
        btnToSeq.style.display = "none";
      } else {
        const fresh = btnToSeq.cloneNode(true);
        btnToSeq.replaceWith(fresh);
        fresh.addEventListener("click", () => {
          const { q9 } = phaseData.recoveryRecord.answers;
          if (!q9) {
            if (!confirm("問8が未入力です。このまま進みますか？")) return;
          }
          switchPhase(PHASE.SEQUENCE);
        });
      }
    }
  }

  function restoreRecoveryRecordAnswers() {
    const { q9 } = phaseData.recoveryRecord.answers;

    // q9 復元
    const q9ta = $("rrQ9Answer");
    if (q9ta && q9) {
      q9ta.value = q9;
      const cc = $("rrQ9CharCount");
      if (cc) {
        cc.textContent = q9.length;
        const max = RECOVERY_RECORD_CONTENT.questions.find(q => q.id === "q9")?.maxLength || 200;
        cc.parentElement.className =
          "char-count" + (q9.length > max ? " over" : q9.length >= max * 0.9 ? " warn" : "");
      }
    }
  }

  // ================================================================
  // PHASE 1 TUTORIAL BAR — サブフェーズ制御
  // ================================================================

  const ACUTE_TUTORIAL_TEXTS = {
    [ACUTE_SUB.L1_COMMAND]: "まずは「指揮層」に配置すべき組織を配置してみましょう。災害対応の全体を統括する目的・戦略・優先順位を決定する組織を配置します。\n配置できたら「次へ進む」を押してください。",
    [ACUTE_SUB.L2_SECTION]: "次は「調整・統制層」を配置しましょう。現場の情報を集約し組織間の調整を担う組織を配置します。\n配置できたら「次へ進む」を押してください。",
    [ACUTE_SUB.L3_BRANCH]:  "次は「実働層」に配置すべき組織を配置しましょう。現場で具体的な支援活動を担当する組織を配置します。\n配置できたら「次へ進む」を押してください。",
    [ACUTE_SUB.REVIEW]:     "最後に、全ての組織が適切な層に配置されているか確認しましょう。\n確認できたら「配置完了！差分確認へ」を押して、配置の確認結果に進みます。",
    [ACUTE_SUB.EDGE]:       "配置した組織間の関係を矢印で表現しましょう。レイヤー（層）は確定済みのため変更できません。組織の位置は同じ層の中でのみ調整できます。組織の削除はできません。\n完成したら「これで完成」を押してください。",
  };

  // スナップショットログを記録する
  function _logAcuteSnapshot(trigger) {
    logOp("ACUTE_LAYOUT_SNAPSHOT", {
      trigger,
      subPhase: state.acuteSubPhase,
      nodes: state.nodes.map(n => ({
        id: n.id, label: n.label, layerId: n.layerId, x: n.x, y: n.y, isInitial: !!n.isInitial
      })),
      edges: state.edges.map(e => ({
        id: e.id, from: e.from, to: e.to, label: e.label, bidirectional: !!e.bidirectional
      })),
    });
  }

  // サブフェーズの順序定義
  const ACUTE_SUB_ORDER = [
    ACUTE_SUB.L1_COMMAND,
    ACUTE_SUB.L2_SECTION,
    ACUTE_SUB.L3_BRANCH,
    ACUTE_SUB.REVIEW,
    ACUTE_SUB.EDGE,
  ];

  /**
   * Phase 1 のサブフェーズを切り替える。
   * @param {string}  newSub   - ACUTE_SUB のいずれかの値
   * @param {boolean} doLog    - true のときスナップショットログを記録する
   */
  function setAcuteSubPhase(newSub, doLog = true) {
    state.acuteSubPhase = newSub;

    // ── チュートリアルテキスト更新 ──────────────────────────────────────
    const textEl = $("acuteTutorialText");
    if (textEl) {
      textEl.textContent = ACUTE_TUTORIAL_TEXTS[newSub] || "";
      textEl.dataset.sub = newSub;
    }

    // ── ボタン状態更新 ──────────────────────────────────────────────────
    const backBtn = $("acuteSubBack");
    const nextBtn = $("acuteSubNext");
    const idx     = ACUTE_SUB_ORDER.indexOf(newSub);

    if (backBtn) {
      // EDGE から REVIEW へ戻る動線は新フローでは存在しない（レイヤーはフェーズ13で確定済み）
      backBtn.disabled = (newSub === ACUTE_SUB.L1_COMMAND || newSub === ACUTE_SUB.EDGE);
      backBtn.textContent = "前の層を見直す";
    }
    if (nextBtn) {
      if (newSub === ACUTE_SUB.REVIEW) {
        nextBtn.textContent = "配置完了！差分確認へ";
      } else if (newSub === ACUTE_SUB.EDGE) {
        nextBtn.textContent = "これで完成";
      } else {
        nextBtn.textContent = "次へ進む";
      }
      nextBtn.disabled = false;
    }

    // ── EDGE サブフェーズの UI 制御 ─────────────────────────────────────
    const isEdge  = newSub === ACUTE_SUB.EDGE;
    const phase1  = $("phase-1");

    // パレット表示制御（EDGE では非表示）
    if (paletteEl) {
      const sbBlock = paletteEl.closest(".sb-block");
      if (sbBlock) sbBlock.style.display = isEdge ? "none" : "";
    }

    // EDGE ではノード削除ボタンを全非表示、接続ボタンを表示制御
    // renderNodes が呼ばれたときに state.acuteSubPhase を参照して制御するため、
    // ここでは現在表示中のノード要素を即時更新する
    if (canvasEl) {
      if (isEdge) {
        canvasEl.querySelectorAll(".node-delete-btn").forEach(b => b.style.display = "none");
        canvasEl.querySelectorAll(".node-connect-btn").forEach(b => b.style.display = "flex");
      } else {
        // 1A: 接続ボタン非表示
        canvasEl.querySelectorAll(".node-connect-btn").forEach(b => b.style.display = "none");
        // 削除ボタン: 1A（レイヤー配置）では非表示（renderNodes で制御するためここでは再描画に委ねる）
        renderNodes();
      }
    }

    // EDGE から 1A に戻るとき矢印描画モードをキャンセル
    if (!isEdge && state.drawingArrow) cancelArrowDraw();

    // ログ記録
    if (doLog) {
      _logAcuteSnapshot(newSub === ACUTE_SUB.EDGE ? "SUB_NEXT" : "SUB_CHANGE");
    }

    saveToLocalStorage();
  }

  // ツールチップトグルボタンのラベルを現在の state に合わせる
  function updateTooltipToggleBtn() {
    const label = `💡 組織説明: ${state.tooltipEnabled ? "ON" : "OFF"}`;
    for (const id of ["acuteTooltipToggle", "p5TooltipToggle", "p6TooltipToggle"]) {
      const btn = $(id);
      if (!btn) continue;
      btn.textContent = label;
      btn.classList.toggle("tooltip-toggle-off", !state.tooltipEnabled);
    }
  }

  // ================================================================
  // PHASE 1 TOOLTIP
  // ================================================================

  function _positionTooltip(anchorEl, tooltipId = "acuteNodeTooltip") {
    const tooltip = $(tooltipId);
    if (!tooltip) return;
    // tooltip は .canvas-col（position:relative）の直下に置かれる
    const parentEl = tooltip.offsetParent || tooltip.parentElement;
    if (!parentEl) return;
    const aRect = anchorEl.getBoundingClientRect();
    const pRect = parentEl.getBoundingClientRect();
    const tooltipW = 234;
    let left = aRect.right - pRect.left + 10;
    let top  = aRect.top  - pRect.top;
    if (left + tooltipW > pRect.width) {
      left = aRect.left - pRect.left - tooltipW - 6;
    }
    left = Math.max(4, left);
    const tooltipH = tooltip.offsetHeight || 60;
    top = Math.max(4, Math.min(top, pRect.height - tooltipH - 4));
    tooltip.style.left = left + "px";
    tooltip.style.top  = top  + "px";
  }

  function showAcuteTooltip(label, anchorEl) {
    // エッジ段階でも組織説明は有用なため 14 を追加 [CHANGED]
    if (!state.tooltipEnabled) return;
    if (state.phase !== PHASE.ACUTE_MAP && state.phase !== PHASE.ACUTE_EDGE_MAP) return;
    const desc = NODE_DESCRIPTIONS[label];
    if (!desc) return;
    const tooltip = $("acuteNodeTooltip");
    if (!tooltip) return;
    tooltip.textContent = desc;
    tooltip.style.display = "block";
    _positionTooltip(anchorEl);
  }

  function hideAcuteTooltip() {
    const tooltip = $("acuteNodeTooltip");
    if (tooltip) tooltip.style.display = "none";
  }

  function showNodeTooltip(label, anchorEl, tooltipId) {
    if (!state.tooltipEnabled) return;
    const desc = NODE_DESCRIPTIONS[label];
    if (!desc) return;
    const tooltip = $(tooltipId);
    if (!tooltip) return;
    tooltip.textContent = desc;
    tooltip.style.display = "block";
    _positionTooltip(anchorEl, tooltipId);
  }

  function hideNodeTooltip(tooltipId) {
    const t = $(tooltipId);
    if (t) t.style.display = "none";
  }

  // ================================================================
  // RENDER ALL
  // ================================================================
  function renderAll() {
    updateSelectors();
    renderNodes();
    renderEdges();
    updateCanvasStat();
    if (activePhaseKey === "p6" || activePhaseKey === "acute") renderPalette();
    if (state.highlightNodeId) applyHighlight(state.highlightNodeId);
  }

  // ================================================================
  // EVENTS
  // ================================================================
  function wireEvents() {
    $("btnExport")?.addEventListener("click", exportJSON);
    $("btnImport")?.addEventListener("click", importJSON);
    $("btnReset")?.addEventListener("click", resetAll);

    // ── Phase 1 チュートリアルバー ────────────────────────────────────────

    // 「次へ進む」ボタン
    $("acuteSubNext")?.addEventListener("click", () => {
      if (state.phase !== PHASE.ACUTE_MAP && state.phase !== PHASE.ACUTE_EDGE_MAP) return;
      const cur = state.acuteSubPhase;
      const idx = ACUTE_SUB_ORDER.indexOf(cur);

      if (cur === ACUTE_SUB.REVIEW) {
        // REVIEW 分岐はフェーズ1（ACUTE_MAP）でのみ発火する
        if (state.phase !== PHASE.ACUTE_MAP) return;
        // REVIEW → ACUTE_LAYER_DIFF（レイヤー差分提示フェーズ）: パレットに残っているノードがないか検証 [CHANGED]
        const remaining = paletteEl
          ? Array.from(paletteEl.querySelectorAll(".pitem:not(.pitem-placed)"))
              .map(el => el.querySelector(".plabel")?.textContent || "")
              .filter(Boolean)
          : [];
        if (remaining.length > 0) {
          showToast(`以下の組織がまだ配置されていません: ${remaining.join("、")}`, 4000);
          logOp("VALIDATION_ERROR", {
            type: "ACUTE_LAYOUT_INCOMPLETE",
            attemptedTransition: "REVIEW_TO_EDGE",
            remainingPaletteLabels: remaining,
          });
          return;
        }
        _logAcuteSnapshot("SUB_NEXT");
        logOp("ACUTE_SUB_NEXT", { from: cur, to: "ACUTE_LAYER_DIFF" });
        switchPhase(PHASE.ACUTE_LAYER_DIFF);
        return;
      }

      if (cur === ACUTE_SUB.EDGE) {
        // EDGE 分岐はフェーズ14（ACUTE_EDGE_MAP）でのみ発火する
        if (state.phase !== PHASE.ACUTE_EDGE_MAP) return;
        // EDGE → ACUTE_DIFF（エッジ差分提示フェーズ）に遷移
        _logAcuteSnapshot("PHASE_COMPLETE");
        logOp("ACUTE_SUB_NEXT", { from: cur, to: "ACUTE_DIFF" });
        switchPhase(PHASE.ACUTE_DIFF);
        return;
      }

      if (idx >= 0 && idx < ACUTE_SUB_ORDER.length - 1) {
        const next = ACUTE_SUB_ORDER[idx + 1];
        _logAcuteSnapshot("SUB_NEXT");
        logOp("ACUTE_SUB_NEXT", { from: cur, to: next });
        setAcuteSubPhase(next, false);
      }
    });

    // 「前の層を見直す」ボタン
    $("acuteSubBack")?.addEventListener("click", () => {
      if (state.phase !== PHASE.ACUTE_MAP) return;
      const cur = state.acuteSubPhase;
      const idx = ACUTE_SUB_ORDER.indexOf(cur);
      if (idx <= 0) return; // L1_COMMAND は無効
      const prev = ACUTE_SUB_ORDER[idx - 1];
      _logAcuteSnapshot("SUB_BACK");
      logOp("ACUTE_SUB_BACK", { from: cur, to: prev });
      setAcuteSubPhase(prev, false);
    });

    // 「組織説明 ON/OFF」トグル（Phase 1/5/6 共通フラグ）
    for (const id of ["acuteTooltipToggle", "p5TooltipToggle", "p6TooltipToggle"]) {
      $(id)?.addEventListener("click", () => {
        state.tooltipEnabled = !state.tooltipEnabled;
        logOp("TOOLTIP_TOGGLE", { enabled: state.tooltipEnabled });
        updateTooltipToggleBtn();
        if (!state.tooltipEnabled) {
          hideAcuteTooltip();
          hideNodeTooltip("p5NodeTooltip");
          hideNodeTooltip("p6NodeTooltip");
        }
        saveToLocalStorage();
      });
    }

    // [NEW] 差分提示フェーズ（ACUTE_LAYER_DIFF / ACUTE_DIFF 共用ビュー）のナビゲーション [CHANGED]
    $("btnDiffBack")?.addEventListener("click", () => {
      if (state.phase === PHASE.ACUTE_LAYER_DIFF) { switchPhase(PHASE.ACUTE_MAP); return; }
      switchPhase(PHASE.ACUTE_EDGE_MAP); // ACUTE_DIFF（10）: 旧 ACUTE_MAP から変更
    });
    // [CHANGED flow-v2] 修正フェーズ（Phase 11/13）廃止に伴い、修正後スコアの測定点を
    // walkthrough退出（このボタン）に移設。編集は Phase 10/12 のbundleループ側で完結している。
    $("btnDiffNext")?.addEventListener("click", () => {
      // [ADDED flow-v2補修] walkthrough完走前の退出ゲート。disabled属性は使わない
      // （未完走退出の試行そのものをプロセス測定として残すため、クリックイベントは殺さない）。
      if (!_dwReachedComplete) {
        showToast("すべての修正ポイントを確認してから進んでください（右側パネルの「次へ」で最後まで進めます）", 3500);
        logOp("WALKTHROUGH_EXIT_BLOCKED", {
          stage: _dwStage,
          bundleIndex: _dwBundleIndex,
          bundleCount: _dwBundles.length,
          stageInBundle: _dwStageInBundle,
        });
        return;
      }
      if (state.phase === PHASE.ACUTE_LAYER_DIFF) {
        // 採点 → snap → 遷移 の順序が測定上決定的に重要（snap後に採点すると修正到達度が測れない）。
        // snap は canvasWrap が canvasWrap-diff（表示中）を指している switchPhase 前に呼ぶこと（1-4）。
        const revisedResult = gradeAcuteLayerRevisedPhase();
        if (revisedResult) {
          snapAcuteLayersToIdeal(revisedResult.layerErrors);
        } else {
          // 採点不能時はスナップせず遷移を許す。学習者を閉じ込めないことを優先し、
          // 原因は GRADING_ERROR / console に残っている。
          logOp("ACUTE_LAYER_SNAP_SKIPPED", { reason: "grading_unavailable" });
        }
        switchPhase(PHASE.ACUTE_EDGE_MAP);
        return;
      }
      gradeRevisedPhase();
      switchPhase(PHASE.ACUTE_COMPARE);
    });
    // [NEW] bundleループのナビゲーション。ヒントステージでは「修正できた」クリックで
    // 採点＋ログのみ行いbundleインデックスは進めず、同じbundleの正解ステージへ遷移する。
    $("dwPrev")?.addEventListener("click", () => {
      if (_dwBundleIndex <= -1) return;
      showBundleStep(_dwBundleIndex - 1, "prev");
    });
    $("dwNext")?.addEventListener("click", () => {
      const N = _dwBundles.length;
      if (_dwBundleIndex >= 0 && _dwBundleIndex < N && _dwStageInBundle === "hint") {
        const bundle = _dwBundles[_dwBundleIndex];
        confirmBundleFix(bundle);
        _dwStageInBundle = "answer";
        renderBundleStage();
        return;
      }
      if (_dwBundleIndex >= N) return;
      showBundleStep(_dwBundleIndex + 1, "next");
    });

    // [DEPRECATED flow-v2] btnReviseBack/btnReviseNext ハンドラは削除。
    // Phase 11/13 は生きた遷移経路を持たない（修正プロンプト(b) 2-5）。

    // [CHANGED flow-v2] 比較・分析フェーズの「戻る」（ACUTE_COMPARE → ACUTE_DIFF。
    // 旧 ACUTE_REVISE は経由しない）
    $("btnCompareBack")?.addEventListener("click", () => switchPhase(PHASE.ACUTE_DIFF));

    // [ADDED] 「問3・4へ進む」ボタン（ACUTE_COMPARE → ACUTE_RECORD）
    $("btnToAcuteRecord")?.addEventListener("click", () => {
      const ans = phaseData.acute.answers;
      const allFilled = ans.p3q1 && ans.p3q2sel && ans.p3q2;
      if (!allFilled) {
        if (!confirm("未入力の設問があります。続けますか？")) return;
      }
      switchPhase(PHASE.ACUTE_RECORD);
    });

    // Phase3 記述問題パネル
    const p3q1 = $("p3q1Answer");
    const p3q2 = $("p3q2Answer");
    const _ansState = {}; // { questionId: { started, editCount, maxLengthReached } }

    function _attachTextareaLog(ta, questionId, onInput) {
      if (!ta) return;
      _ansState[questionId] = { started: false, editCount: 0, maxLengthReached: 0 };
      ta.addEventListener("focus", () => {
        if (!_ansState[questionId].started) {
          _ansState[questionId].started = true;
          _ansState[questionId].editCount = 0;
          _ansState[questionId].maxLengthReached = ta.value.length;
          logOp("ANSWER_START", { questionId });
        }
      });
      ta.addEventListener("input", () => {
        _ansState[questionId].editCount += 1;
        _ansState[questionId].maxLengthReached = Math.max(_ansState[questionId].maxLengthReached, ta.value.length);
        onInput();
      });
      ta.addEventListener("blur", () => {
        const st = _ansState[questionId];
        if (st.editCount === 0) return;
        logOp("ANSWER_CHANGE", {
          questionId,
          valueLength: ta.value.length,
          editCount: st.editCount,
          maxLengthReached: st.maxLengthReached
        });
        st.editCount = 0;
      });
    }

    _attachTextareaLog(p3q1, "acute.p3q1", () => {
      const len = p3q1.value.length;
      const cc  = $("p3q1CharCount");
      if (cc) {
        cc.textContent = len;
        cc.parentElement.className =
          "char-count" + (len > 100 ? " over" : len >= 90 ? " warn" : "");
      }
      phaseData.acute.answers.p3q1 = p3q1.value;
      debouncedSave();
    });

    _attachTextareaLog(p3q2, "acute.p3q2", () => {
      const len = p3q2.value.length;
      const cc  = $("p3q2CharCount");
      if (cc) {
        cc.textContent = len;
        cc.parentElement.className =
          "char-count" + (len > 100 ? " over" : len >= 90 ? " warn" : "");
      }
      phaseData.acute.answers.p3q2 = p3q2.value;
      debouncedSave();
    });

    document.querySelectorAll('input[name="p3q2principle"]').forEach(radio => {
      radio.addEventListener("change", () => {
        phaseData.acute.answers.p3q2sel = radio.value;
        logOp("ANSWER_SELECT", { questionId: "acute.p3q2sel", value: radio.value });
      });
    });

    // [ADDED] 復旧期比較・分析 テキストエリア文字数カウント
    const rcQ6 = $("rcQ6Answer");
    const rcQ7 = $("rcQ7Answer");
    _attachTextareaLog(rcQ6, "recoveryCompare.q6", () => {
      const len = rcQ6.value.length;
      const cc  = $("rcQ6CharCount");
      if (cc) {
        cc.textContent = len;
        const max = RECOVERY_COMPARE_CONTENT.questions.find(q => q.id === "q6")?.maxLength || 100;
        cc.parentElement.className = "char-count" + (len > max ? " over" : len >= max * 0.9 ? " warn" : "");
      }
      phaseData.recoveryCompare.answers.q6 = rcQ6.value;
      debouncedSave();
    });
    _attachTextareaLog(rcQ7, "recoveryCompare.q7", () => {
      const len = rcQ7.value.length;
      const cc  = $("rcQ7CharCount");
      if (cc) {
        cc.textContent = len;
        const max = RECOVERY_COMPARE_CONTENT.questions.find(q => q.id === "q7")?.maxLength || 200;
        cc.parentElement.className = "char-count" + (len > max ? " over" : len >= max * 0.9 ? " warn" : "");
      }
      phaseData.recoveryCompare.answers.q7 = rcQ7.value;
      debouncedSave();
    });
    document.querySelectorAll('input[name="rcQ7principle"]').forEach(radio => {
      radio.addEventListener("change", () => {
        phaseData.recoveryCompare.answers.q7sel = radio.value;
        logOp("ANSWER_SELECT", { questionId: "recoveryCompare.q7sel", value: radio.value });
      });
    });

    // 「対応検証記録（復旧期）へ進む」ボタン（問6 入力チェック付き）
    // Phase 6 → TRANSITION_COMPARE [NEW]
    $("btnFromP6ToTransition")?.addEventListener("click", () => {
      switchPhase(PHASE.TRANSITION_COMPARE);
    });

    // TRANSITION_COMPARE → RECOVERY_COMPARE [NEW]
    $("btnFromTransitionToRecoveryCompare")?.addEventListener("click", () => {
      switchPhase(PHASE.RECOVERY_COMPARE);
    });

    $("btnToRecoveryRecord")?.addEventListener("click", () => {
      const { q6, q7 } = phaseData.recoveryCompare.answers;
      if (!q6) {
        showToast("問6で構造的差異を入力してください", 3000);
        return;
      }
      if (!q7) {
        if (!confirm("問7 が未入力です。このまま進みますか？")) return;
      }
      switchPhase(PHASE.RECOVERY_RECORD);
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !state.drawingArrow && state.selectedNodeId) {
        clearSelection();
        return;
      }
      if (!state.selectedEdgeId) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      deleteEdge(state.selectedEdgeId);
    });
  }

  // ================================================================
  // TOAST NOTIFICATION
  // ================================================================
  function showToast(message, duration = 2000) {
    let toast = document.getElementById("toastNotification");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toastNotification";
      Object.assign(toast.style, {
        position: "fixed", bottom: "80px", left: "50%",
        transform: "translateX(-50%)",
        background: "#1e1028", border: "1px solid #c084fc", color: "#d8b4fe",
        padding: "10px 22px", borderRadius: "10px", fontSize: "13px",
        fontWeight: "600", zIndex: "9999", whiteSpace: "nowrap",
        boxShadow: "0 4px 20px rgba(0,0,0,0.6)", transition: "opacity 0.3s",
        pointerEvents: "none",
      });
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = "1";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = "0"; }, duration);
  }

  // ================================================================
  // EDGE EXCLUSIVITY CHECK
  // ================================================================
  /**
   * 2ノード間に指定タイプのエッジを追加できるか判定する
   * @param {string} fromId - 起点ノードID
   * @param {string} toId   - 終点ノードID
   * @param {string} type   - 追加しようとするエッジ種別 ("指示命令"|"情報伝達"|"連携協力"|"支援")
   * @param {Array}  edges  - 現在のエッジ配列
   * @returns {{ allowed: boolean, reason: string }}
   */
  function canAddEdge(fromId, toId, type, edges) {
    const CMD_INFO = new Set(["指示命令", "情報伝達"]);
    const COOP     = "連携協力";

    // 支援エッジは排他チェック対象外
    if (type === "支援") return { allowed: true, reason: "" };

    // 無方向ペアのエッジ（COOP共存チェック用）
    const pairEdges = edges.filter(e =>
      (e.from === fromId && e.to === toId) ||
      (e.from === toId   && e.to === fromId)
    );

    // COOP追加時
    if (type === COOP) {
      // CMD/INFOが存在すれば拒否（無方向）
      if (pairEdges.some(e => CMD_INFO.has(e.label))) {
        return { allowed: false, reason: "指示命令または情報伝達が設定済みのペアには連携協力を追加できません" };
      }
      // COOP重複チェックは無方向（A↔B を同一ペアとみなす）
      if (pairEdges.some(e => e.label === COOP)) {
        return { allowed: false, reason: "同じ種類の矢印がすでに存在します" };
      }
    }

    // CMD/INFO追加時
    if (CMD_INFO.has(type)) {
      // COOPが存在すれば拒否（無方向）
      if (pairEdges.some(e => e.label === COOP)) {
        return { allowed: false, reason: "連携協力が設定済みのペアには指示命令・情報伝達を追加できません" };
      }
      // 重複チェックは有方向（同一 from/to/type のみブロック。逆向きは別エッジとして許可）
      if (edges.some(e => e.from === fromId && e.to === toId && e.label === type)) {
        return { allowed: false, reason: "同じ種類の矢印がすでに存在します" };
      }
    }

    return { allowed: true, reason: "" };
  }

  // ================================================================
  // MAP LOADERS
  // ================================================================

  // 実際マップJSONから、指定フェーズ（"acute" / "recovery"）のマップ本体を
  // 抽出・検証する共通関数。表示用の統一形式 { nodes, edges } を返す。
  // 新形式（json[phaseKey].nodes/edges）を優先し、見つからない場合のみ
  // 旧形式（ルート直下 json.nodes/edges）に後方互換フォールバックする。
  // 検証に失敗した場合は ok:false と理由を返す（例外は投げない）。
  function extractActualPhaseMap(json, phaseKey) {
    if (!json || typeof json !== "object") {
      return { ok: false, reason: "JSON のルートがオブジェクトではありません" };
    }

    let container = null;
    let source = null;
    const phaseSection = json[phaseKey];
    if (phaseSection && typeof phaseSection === "object" && !Array.isArray(phaseSection)) {
      container = phaseSection;
      source = `${phaseKey}`;
    } else if (Array.isArray(json.nodes) && Array.isArray(json.edges)) {
      // 後方互換：ルート直下 nodes/edges 形式
      container = json;
      source = "root (legacy)";
    }

    if (!container) {
      return {
        ok: false,
        reason: `"${phaseKey}" セクションが見つからず、ルート直下の nodes/edges も見つかりません`,
      };
    }

    const { nodes, edges } = container;
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return {
        ok: false,
        reason: `"${source}" 内の nodes/edges が配列ではありません（nodes: ${typeof nodes}, edges: ${typeof edges}）`,
      };
    }

    return { ok: true, map: { nodes, edges } };
  }

  async function loadIdealMapAcute() {
    mapLoadStatus.idealAcute = "loading";
    try {
      const resp = await fetch('./ideal_map_acute.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      window.idealMapAcute = await resp.json();
      mapLoadStatus.idealAcute = "ready";
      logOp("IDEAL_MAP_LOADED", {
        source: "fetch",
        nodeCount: window.idealMapAcute?.nodes?.length ?? null,
        edgeCount: window.idealMapAcute?.edges?.length ?? null,
        mapVersion: window.idealMapAcute?.mapVersion ?? null,
      });
      // 採点定数（IDEAL_COMMAND_EDGES / IDEAL_HUB_MAP / IDEAL_SUPPORT_EDGES）と
      // 配信中の理想マップJSONの整合性を検査する。配信ファイル差し替え事故の早期検出用。
      // 監査失敗時も学習フローは止めない（記録と警告のみ）。
      try {
        const S = window.__ICS_SCORING__;
        if (S?.auditIdealConsistency && S?.normalizeMap) {
          const audit = S.auditIdealConsistency(S.normalizeMap(window.idealMapAcute));
          if (!audit.ok) {
            console.error('[ICS] 採点定数と理想マップJSONが不一致:', audit.mismatches);
            logOp("SCORING_IDEAL_MISMATCH", { mismatches: audit.mismatches });
          } else {
            logOp("SCORING_IDEAL_CONSISTENT", {});
          }
        }
      } catch (e) {
        console.error('[ICS] 整合性監査の実行に失敗:', e);
      }
    } catch (e) {
      console.error('[ICS] ideal_map_acute.json の読み込みに失敗:', e);
      if (window.IDEAL_MAP_ACUTE_FALLBACK) {
        window.idealMapAcute = window.IDEAL_MAP_ACUTE_FALLBACK;
        mapLoadStatus.idealAcute = "ready";
        logOp("IDEAL_MAP_LOADED", {
          source: "fallback",
          nodeCount: window.idealMapAcute?.nodes?.length ?? null,
          edgeCount: window.idealMapAcute?.edges?.length ?? null,
          mapVersion: window.idealMapAcute?.mapVersion ?? null,
        });
      } else {
        mapLoadStatus.idealAcute = "error";
        logOp("IDEAL_MAP_LOAD_FAILED", { message: String(e && e.message || e) });
      }
    }
    // Phase5 / Phase6 に滞在中なら自動再描画
    if (state.phase === PHASE.RECOVERY_PREP || state.phase === PHASE.RECOVERY_MAP) {
      switchPhase(state.phase);
    }
  }

  // 復旧期正解マップ（ideal_map_recovery.json）の読み込み。
  // json.recovery.nodes/edges を優先し、後方互換でルート直下 json.nodes/edges にも対応する
  // （extractActualPhaseMap を流用・無変更。検証に失敗した場合は ready にしない）。
  // 追加検証（nodes/edges が空でないこと）と、recovery-scoring.js の原則参照監査
  // （auditRecoveryIdealConsistency）はこの関数側で行う。
  // 復旧期の差分表示フェーズ（後続作業）はまだ存在しないため、読み込み後の自動再描画は行わない。
  async function loadIdealMapRecovery() {
    mapLoadStatus.idealRecovery = "loading";
    try {
      const resp = await fetch('./ideal_map_recovery.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const result = extractActualPhaseMap(json, "recovery");
      if (!result.ok) throw new Error(result.reason);

      // ready 条件の追加検証：nodes/edges が配列であることに加え、空でないことを要求する。
      // recovery.nodes = [] のような壊れたJSONがそのまま ready になると、差分提示フェーズで
      // 19件の node_missing が「差分」として学習者に提示されてしまうため。
      if (!(result.map.nodes.length > 0 && result.map.edges.length > 0)) {
        throw new Error(
          `"recovery" のノード/エッジが空です（nodeCount=${result.map.nodes.length}, edgeCount=${result.map.edges.length}）`
        );
      }

      const mapVersion = json?.recovery?.mapVersion ?? json?.mapVersion ?? null;
      if (mapVersion === null) {
        console.warn('[ICS] ideal_map_recovery.json（対象: recovery）に mapVersion がありません。');
      }

      const candidate = { nodes: result.map.nodes, edges: result.map.edges, mapVersion };

      // 原則参照監査（auditRecoveryIdealConsistency）を一度だけ実行する。純粋関数のため
      // 副作用はなく、結果のログ記録はこの呼び出し側（app.js）の責務。
      const RS = window.__ICS_RECOVERY_SCORING__;
      if (!RS || !RS.normalizeRecoveryMap || !RS.auditRecoveryIdealConsistency) {
        throw new Error('window.__ICS_RECOVERY_SCORING__ が見つかりません（recovery-scoring.js の読み込み順を確認してください）');
      }
      const idealNorm = RS.normalizeRecoveryMap(candidate);
      const audit = RS.auditRecoveryIdealConsistency(idealNorm);

      console.log('[ICS] ideal_map_recovery.json（対象: recovery）監査結果:', audit);
      logOp("IDEAL_MAP_RECOVERY_AUDIT", {
        ok: audit.ok,
        errors: audit.errors,
        warnings: audit.warnings,
      });

      if (!audit.ok) {
        // エラー項目が1つでもあれば ready にしない（採点定数と理想JSONの不整合を検出）
        console.error('[ICS] ideal_map_recovery.json の監査でエラーを検出したため ready にしません:', audit.errors);
        mapLoadStatus.idealRecovery = "error";
        logOp("IDEAL_MAP_RECOVERY_LOAD_FAILED", { message: "audit failed", errors: audit.errors });
        return;
      }
      if (audit.warnings.length > 0) {
        // 警告項目（件数の期待値ずれ等）は ready を維持し、警告のみ出す
        console.warn('[ICS] ideal_map_recovery.json の監査で警告があります（readyは維持します）:', audit.warnings);
      }

      window.idealMapRecovery = candidate;
      mapLoadStatus.idealRecovery = "ready";

      console.log(
        `[ICS] ideal_map_recovery.json（対象: recovery）を読み込みました: nodeCount=${candidate.nodes.length}, edgeCount=${candidate.edges.length}, mapVersion=${mapVersion}`
      );
      logOp("IDEAL_MAP_RECOVERY_LOADED", {
        source: "fetch",
        nodeCount: candidate.nodes.length,
        edgeCount: candidate.edges.length,
        mapVersion: candidate.mapVersion,
      });
    } catch (e) {
      console.error(`[ICS] ideal_map_recovery.json の読み込みに失敗（対象: recovery）:`, e && e.message || e);
      mapLoadStatus.idealRecovery = "error";
      logOp("IDEAL_MAP_RECOVERY_LOAD_FAILED", { message: String(e && e.message || e) });
    }
  }

  async function loadActualMapAcute() {
    mapLoadStatus.actualAcute = "loading";
    try {
      const resp = await fetch('./actual_map_acute.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const result = extractActualPhaseMap(json, "acute");
      if (!result.ok) throw new Error(result.reason);
      window.actualMapAcute = result.map;
      mapLoadStatus.actualAcute = "ready";
    } catch (e) {
      console.error(`[ICS] actual_map_acute.json の読み込みに失敗（対象: acute）:`, e && e.message || e);
      if (window.ACTUAL_MAP_ACUTE_FALLBACK) {
        const fbResult = extractActualPhaseMap(window.ACTUAL_MAP_ACUTE_FALLBACK, "acute");
        if (fbResult.ok) {
          window.actualMapAcute = fbResult.map;
          mapLoadStatus.actualAcute = "ready";
        } else {
          console.error('[ICS] actual_map_acute.json のフォールバックデータも不正です（対象: acute）:', fbResult.reason);
          mapLoadStatus.actualAcute = "error";
        }
      } else {
        mapLoadStatus.actualAcute = "error";
      }
    }
    // ACUTE_COMPARE に滞在中なら自動再描画
    if (state.phase === PHASE.ACUTE_COMPARE) {
      switchPhase(state.phase);
    }
  }

  async function loadActualMapRecovery() {
    mapLoadStatus.actualRecovery = "loading";
    try {
      const resp = await fetch('./actual_map_recovery.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const result = extractActualPhaseMap(json, "recovery");
      if (!result.ok) throw new Error(result.reason);
      window.actualMapRecovery = result.map;
      mapLoadStatus.actualRecovery = "ready";
    } catch (e) {
      console.error(`[ICS] actual_map_recovery.json の読み込みに失敗（対象: recovery）:`, e && e.message || e);
      mapLoadStatus.actualRecovery = "error";
    }
    // RECOVERY_COMPARE に滞在中なら自動再描画
    if (state.phase === PHASE.RECOVERY_COMPARE) {
      switchPhase(state.phase);
    }
  }

  // ================================================================
  // TUTORIAL MODULE — Phase 0 ハンズオン型操作チュートリアル
  // 本番コード（state, canvasEl, addNode等）とは完全に独立。
  // ================================================================

  const tutorialState = {
    nodes: [], edges: [],
    currentStep: 1,
    completedSteps:  new Set(),
    skippedSteps:    new Set(),
    suppressedSteps: new Set(),
    startedAt:  null,
    finishedAt: null,
    skippedAll: false,
    _startedMs: null,
    _lastDblClickedNodeId: null,
  };

  let tutDom             = {};
  let tutArrow           = { active: false, fromId: null };
  let tutArrowPreviewPos = null;
  let _tutAutoAdvanceTimer = null;
  let _tutIdleTimer        = null;

  const TUTORIAL_IDLE_TIMEOUT_MS = 60_000;
  const TUT_LABELS = ["A", "B", "C"];

  function _tutLabelOf(s, nodeId) {
    return s.nodes.find(n => n.id === nodeId)?.label;
  }

  const TUTORIAL_STEPS = [
    {
      n: 1,
      instruction: "パレットから <strong>A</strong> をクリックしてキャンバスに追加してください",
      isComplete: s => s.nodes.some(n => n.label === "A"),
      guides: () => [{ sel: '.tut-palette-item[data-label="A"]', strong: true }],
      autoAdvanceDelay: 500,
    },
    {
      n: 2,
      instruction: "<strong>A</strong> を <strong>第1層</strong> にドラッグして配置してください",
      isComplete: s => s.nodes.find(n => n.label === "A")?.layerId === 1,
      guides: () => [
        { sel: '.tut-node[data-label="A"]', strong: true },
        { sel: '.tut-layer-band[data-layer="1"]', strong: true },
      ],
      autoAdvanceDelay: 500,
    },
    {
      n: 3,
      instruction: "パレットから <strong>B</strong> をクリックしてキャンバスに追加してください",
      isComplete: s => s.nodes.some(n => n.label === "B"),
      guides: () => [{ sel: '.tut-palette-item[data-label="B"]', strong: true }],
      autoAdvanceDelay: 500,
    },
    {
      n: 4,
      instruction: "<strong>B</strong> を <strong>第2層</strong> にドラッグして配置してください",
      isComplete: s => s.nodes.find(n => n.label === "B")?.layerId === 2,
      guides: () => [
        { sel: '.tut-node[data-label="B"]', strong: true },
        { sel: '.tut-layer-band[data-layer="2"]', strong: true },
      ],
      autoAdvanceDelay: 500,
    },
    {
      n: 5,
      instruction: "パレットから <strong>C</strong> をクリックしてキャンバスに追加してください",
      isComplete: s => s.nodes.some(n => n.label === "C"),
      guides: () => [{ sel: '.tut-palette-item[data-label="C"]', strong: true }],
      autoAdvanceDelay: 500,
    },
    {
      n: 6,
      instruction: "<strong>C</strong> を <strong>第3層</strong> にドラッグして配置してください",
      isComplete: s => s.nodes.find(n => n.label === "C")?.layerId === 3,
      guides: () => [
        { sel: '.tut-node[data-label="C"]', strong: true },
        { sel: '.tut-layer-band[data-layer="3"]', strong: true },
      ],
      autoAdvanceDelay: 500,
    },
    {
      n: 7,
      instruction: "<strong>A の「→」</strong>をクリックしてから <strong>B をクリック</strong> し、矢印の種類を選択してください",
      isComplete: s => s.edges.some(e =>
        _tutLabelOf(s, e.fromId) === "A" && _tutLabelOf(s, e.toId) === "B"),
      guides: () => [
        { sel: '.tut-node[data-label="A"] .tut-connect-btn', medium: true },
        { sel: '.tut-node[data-label="B"]', medium: true },
      ],
      autoAdvanceDelay: 600,
    },
    {
      n: 8,
      instruction: "<strong>B の「→」</strong>をクリックしてから <strong>C をクリック</strong> し、矢印の種類を選択してください",
      isComplete: s => s.edges.some(e =>
        _tutLabelOf(s, e.fromId) === "B" && _tutLabelOf(s, e.toId) === "C"),
      guides: () => [
        { sel: '.tut-node[data-label="B"] .tut-connect-btn', medium: true },
        { sel: '.tut-node[data-label="C"]', medium: true },
      ],
      autoAdvanceDelay: 600,
    },
    {
      n: 9,
      instruction: "ノードを <strong>ダブルクリック</strong> して、関連するノードがハイライトされることを確認してください（B がもっとも分かりやすくおすすめです）",
      isComplete: s => s._lastDblClickedNodeId !== null,
      guides: () => [{ sel: '.tut-node[data-label="B"]', medium: true }],
      autoAdvanceDelay: 2000,
    },
  ];

  function tutorialHasFinishedEarlier() {
    return state.operationLog.some(e => e.type === "TUTORIAL_FINISH");
  }

  function initTutorial() {
    if (tutorialHasFinishedEarlier()) {
      renderTutorialAsCompleted();
      const btn = $("btnStartMap");
      if (btn) { btn.disabled = false; btn.setAttribute("aria-disabled", "false"); }
      const hint = $("startMapHint"); if (hint) hint.style.display = "none";
      return;
    }
    if (tutorialState.startedAt) return;
    setupTutorialDom();
    renderTutorial();
  }

  function tutorialBeginIfVisible() {
    if (tutorialState.startedAt) return;
    if (state.phase !== PHASE.ORIENTATION) return;
    if (tutorialHasFinishedEarlier()) return;
    tutorialState.startedAt  = new Date().toISOString();
    tutorialState._startedMs = Date.now();
    logOp("TUTORIAL_START", {});
    logOp("TUTORIAL_STEP_ENTER", { step: 1 });
    debouncedSave();
    _tutResetIdleTimer();
  }

  function setupTutorialDom() {
    tutDom = {
      canvas:      $("tutCanvas"),
      svg:         $("tutSvgLayer"),
      palette:     $("tutPalette"),
      prev:        $("tutPrev"),
      skip:        $("tutSkip"),
      progress:    $("tutProgress"),
      instruction: $("tutInstruction"),
      stepNum:     $("tutStepNumCurrent"),
    };
    tutDom.prev?.addEventListener("click", tutorialGoBack);
    tutDom.skip?.addEventListener("click", tutorialSkipAll);

    // hint overlay (shows when in arrow-drawing mode)
    const hint = document.createElement("div");
    hint.className = "tut-arrow-hint";
    hint.style.display = "none";
    tutDom.canvas?.parentElement?.appendChild(hint);
    tutDom.hint = hint;
  }

  // -------- render --------

  function renderTutorial() {
    if (!tutDom.canvas) setupTutorialDom();

    const step = tutorialState.currentStep;
    _renderTutProgress();
    if (tutDom.stepNum) tutDom.stepNum.textContent = step;

    const stepDef = TUTORIAL_STEPS[step - 1];
    if (tutDom.instruction) tutDom.instruction.innerHTML = stepDef?.instruction || "";

    _renderTutPalette();
    _renderTutCanvas();
    _applyTutGuides();
  }

  function _renderTutProgress() {
    const prog = tutDom.progress;
    if (!prog) return;
    prog.innerHTML = "";
    for (let i = 1; i <= TUTORIAL_STEPS.length; i++) {
      const dot = document.createElement("span");
      dot.className = "tut-progress-dot";
      if (tutorialState.completedSteps.has(i))  dot.classList.add("done");
      else if (i === tutorialState.currentStep) dot.classList.add("current");
      dot.textContent = tutorialState.completedSteps.has(i) ? "✓" : "";
      prog.appendChild(dot);
    }
  }

  function _renderTutPalette() {
    const pal = tutDom.palette;
    if (!pal) return;
    pal.innerHTML = "";
    const placed = new Set(tutorialState.nodes.map(n => n.label));

    TUT_LABELS.forEach(label => {
      const item = document.createElement("div");
      item.className = "tut-palette-item";
      item.dataset.label = label;
      if (placed.has(label)) {
        item.classList.add("tut-placed");
        item.innerHTML = `<span class="tut-plabel">${esc(label)}</span><span class="tut-ptag">配置済</span>`;
      } else {
        item.innerHTML = `<span class="tut-plabel">${esc(label)}</span>`;
        item.addEventListener("click", () => _tutAddNode(label));
      }
      pal.appendChild(item);
    });
  }

  function _renderTutCanvas() {
    const canvas = tutDom.canvas;
    const svg    = tutDom.svg;
    if (!canvas || !svg) return;

    canvas.innerHTML = "";
    const canvasWrap = canvas.parentElement;

    // clean up previous mousemove listener
    if (tutDom._arrowMoveHandler && canvasWrap) {
      canvasWrap.removeEventListener("mousemove", tutDom._arrowMoveHandler);
      tutDom._arrowMoveHandler = null;
    }

    if (tutArrow.active) {
      canvas.classList.add("tut-drawing-arrow");
      // track mouse for preview line
      tutDom._arrowMoveHandler = e => {
        const rect = canvas.getBoundingClientRect();
        tutArrowPreviewPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        _renderTutSvg();
      };
      canvasWrap?.addEventListener("mousemove", tutDom._arrowMoveHandler);
      // show hint
      if (tutDom.hint) {
        tutDom.hint.textContent = "接続先のノード B をクリックしてください";
        tutDom.hint.style.display = "";
      }
    } else {
      canvas.classList.remove("tut-drawing-arrow");
      tutArrowPreviewPos = null;
      if (tutDom.hint) tutDom.hint.style.display = "none";
    }

    _renderTutSvg();
    tutorialState.nodes.forEach(n => _renderTutNodeEl(n));
  }

  function _renderTutNodeEl(n) {
    const canvas = tutDom.canvas;
    if (!canvas) return;

    const el = document.createElement("div");
    el.className = "tut-node";
    el.dataset.id    = n.id;
    el.dataset.label = n.label;

    el.classList.add(n.layerId ? `tut-layer-${n.layerId}` : "tut-layer-none");
    el.style.left = Math.round(n.x) + "px";
    el.style.top  = Math.round(n.y) + "px";

    if (tutArrow.active) {
      el.classList.add(tutArrow.fromId === n.id ? "arrow-source" : "arrow-target-hover");
    }

    const title = document.createElement("span");
    title.className = "ntitle";
    title.textContent = n.label;
    el.appendChild(title);

    const connectBtn = document.createElement("div");
    connectBtn.className = "tut-connect-btn";
    connectBtn.textContent = "→";
    connectBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (tutArrow.active && tutArrow.fromId === n.id) {
        tutArrow = { active: false, fromId: null };
        _renderTutCanvas();
        return;
      }
      tutArrow = { active: true, fromId: n.id };
      _renderTutCanvas();
    });
    el.appendChild(connectBtn);

    const delBtn = document.createElement("div");
    delBtn.className = "node-delete-btn";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", e => {
      e.stopPropagation();
      tutorialState.nodes = tutorialState.nodes.filter(x => x.id !== n.id);
      tutorialState.edges = tutorialState.edges.filter(e => e.fromId !== n.id && e.toId !== n.id);
      _renderTutCanvas();
      _renderTutPalette();
      tutorialCheckStepCompletion();
    });
    el.appendChild(delBtn);

    el.addEventListener("click", e => {
      if (tutArrow.active && tutArrow.fromId !== n.id) {
        const fromId = tutArrow.fromId;
        tutArrow = { active: false, fromId: null };
        _showTutEdgeLabelPopup(fromId, n.id, e.clientX, e.clientY);
      }
    });

    el.addEventListener("dblclick", e => {
      e.stopPropagation();
      _tutOnNodeDblClick(n.id);
    });

    _makeTutNodeDraggable(el, n);
    canvas.appendChild(el);
  }

  function _makeTutNodeDraggable(el, nodeData) {
    let startX, startY, startNX, startNY, dragging = false, moved = false;

    el.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      if (tutArrow.active) return;
      if (e.target.classList.contains("tut-connect-btn") ||
          e.target.classList.contains("node-delete-btn")) return;

      // do NOT call e.preventDefault() — it suppresses dblclick in some browsers
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY;
      startNX = nodeData.x; startNY = nodeData.y;
      el.style.zIndex = "20";

      const onMove = me => {
        if (!dragging) return;
        const dx = me.clientX - startX, dy = me.clientY - startY;
        if (!moved && Math.sqrt(dx * dx + dy * dy) < 4) return; // dead zone
        moved = true;
        el.style.cursor = "grabbing";
        nodeData.x = Math.max(0, startNX + dx);
        nodeData.y = Math.max(0, startNY + dy);
        el.style.left = Math.round(nodeData.x) + "px";
        el.style.top  = Math.round(nodeData.y) + "px";
        _renderTutSvg();
      };

      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        el.style.cursor = ""; el.style.zIndex = "";

        // only commit layer on actual drag — skip for click/dblclick
        if (moved) {
          const canvas = tutDom.canvas;
          if (canvas) {
            const h = canvas.getBoundingClientRect().height || 300;
            const third = h / 3;
            const centerY = nodeData.y + 18;
            const newLayer = centerY < third ? 1 : centerY < third * 2 ? 2 : 3;
            _tutOnLayerDrop(nodeData.id, newLayer, startNX, startNY);
          }
        }
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function _tutOnLayerDrop(nodeId, droppedLayerId, origX, origY) {
    tutorialState.suppressedSteps.delete(tutorialState.currentStep);
    const node = tutorialState.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const step = tutorialState.currentStep;
    const expectedLayer =
      step === 2 && node.label === "A" ? 1 :
      step === 4 && node.label === "B" ? 2 :
      step === 6 && node.label === "C" ? 3 : null;

    if (expectedLayer !== null && droppedLayerId !== expectedLayer) {
      logOp("TUTORIAL_INVALID_ATTEMPT", {
        step, kind: "wrong_layer",
        attempted: { nodeLabel: node.label, layerId: droppedLayerId },
        expected:  { nodeLabel: node.label, layerId: expectedLayer },
      });
      showToast(`${node.label} を 第${expectedLayer}層 に配置してください`, 2500);
      node.x = origX; node.y = origY;
      _renderTutCanvas();
      return;
    }

    node.layerId = droppedLayerId;
    logOp("TUTORIAL_SET_LAYER", { step, nodeId, label: node.label, layerId: droppedLayerId });
    _renderTutCanvas();
    tutorialCheckStepCompletion();
    _tutResetIdleTimer();
  }

  function _renderTutSvg() {
    const svg = tutDom.svg;
    if (!svg) return;
    svg.innerHTML = "";
    const ns = "http://www.w3.org/2000/svg";

    const defs = document.createElementNS(ns, "defs");
    [{ id: "tut-arr-cmd", c: "#ff6b6b" }, { id: "tut-arr-info", c: "#4d8fff" }, { id: "tut-arr-coop", c: "#3dcf8a" }]
      .forEach(m => {
        const mk = document.createElementNS(ns, "marker");
        mk.setAttribute("id", m.id);
        mk.setAttribute("viewBox", "0 0 10 10");
        mk.setAttribute("refX", "9"); mk.setAttribute("refY", "5");
        mk.setAttribute("markerWidth", "6"); mk.setAttribute("markerHeight", "6");
        mk.setAttribute("orient", "auto");
        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
        path.setAttribute("fill", m.c);
        mk.appendChild(path); defs.appendChild(mk);
      });
    svg.appendChild(defs);

    // dashed preview line while drawing an arrow
    if (tutArrow.active && tutArrowPreviewPos) {
      const fromNode = tutorialState.nodes.find(n => n.id === tutArrow.fromId);
      if (fromNode) {
        const preview = document.createElementNS(ns, "line");
        preview.setAttribute("x1", fromNode.x + 50);
        preview.setAttribute("y1", fromNode.y + 18);
        preview.setAttribute("x2", tutArrowPreviewPos.x);
        preview.setAttribute("y2", tutArrowPreviewPos.y);
        preview.setAttribute("stroke", "#ffd700");
        preview.setAttribute("stroke-width", "2");
        preview.setAttribute("stroke-dasharray", "6 4");
        preview.style.pointerEvents = "none";
        svg.appendChild(preview);
      }
    }

    tutorialState.edges.forEach(e => {
      const fn = tutorialState.nodes.find(n => n.id === e.fromId);
      const tn = tutorialState.nodes.find(n => n.id === e.toId);
      if (!fn || !tn) return;

      const et  = EDGE_TYPES.find(t => t.label === e.label) || EDGE_TYPES[1];
      const mid = e.label === "指示命令" ? "tut-arr-cmd" : e.label === "連携協力" ? "tut-arr-coop" : "tut-arr-info";

      const ax = fn.x + 50, ay = fn.y + 18;
      const bx = tn.x + 50, by = tn.y + 18;
      const dx = bx - ax, dy = by - ay;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;

      // offset parallel lines when a reverse edge exists
      const hasReverse = tutorialState.edges.some(
        r => r.fromId === e.toId && r.toId === e.fromId
      );
      const offsetSign = hasReverse ? (e.fromId < e.toId ? 1 : -1) : 0;
      const perpX = (-dy / dist) * 5 * offsetSign;
      const perpY = (dx  / dist) * 5 * offsetSign;

      const x1 = ax + perpX, y1 = ay + perpY;
      const x2 = bx - (dx/dist)*14 + perpX, y2 = by - (dy/dist)*14 + perpY;

      const hit = document.createElementNS(ns, "line");
      hit.setAttribute("x1", x1); hit.setAttribute("y1", y1);
      hit.setAttribute("x2", x2); hit.setAttribute("y2", y2);
      hit.setAttribute("stroke", "transparent"); hit.setAttribute("stroke-width", "12");
      hit.style.cursor = "pointer";
      hit.addEventListener("click", ev => {
        ev.stopPropagation();
        _showTutEdgeChangePopup(e.id, ev.clientX, ev.clientY);
      });
      svg.appendChild(hit);

      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", x1); line.setAttribute("y1", y1);
      line.setAttribute("x2", x2); line.setAttribute("y2", y2);
      line.setAttribute("stroke", et.stroke); line.setAttribute("stroke-width", "2.5");
      if (et.bidirectional) line.setAttribute("marker-start", "url(#" + mid + ")");
      line.setAttribute("marker-end", "url(#" + mid + ")");
      line.style.pointerEvents = "none";
      svg.appendChild(line);

      const txt = document.createElementNS(ns, "text");
      txt.setAttribute("x", (x1 + x2) / 2); txt.setAttribute("y", (y1 + y2) / 2 - 5);
      txt.setAttribute("text-anchor", "middle"); txt.setAttribute("font-size", "11");
      txt.setAttribute("fill", et.stroke); txt.style.pointerEvents = "none";
      txt.textContent = e.label;
      svg.appendChild(txt);
    });
  }

  function _tutClearGuides() {
    document.querySelectorAll(".tutorial-target-strong, .tutorial-target-medium")
      .forEach(el => el.classList.remove("tutorial-target-strong", "tutorial-target-medium"));
  }

  function _applyTutGuides() {
    _tutClearGuides();
    const stepDef = TUTORIAL_STEPS[tutorialState.currentStep - 1];
    if (!stepDef) return;
    for (const g of stepDef.guides()) {
      const el = document.querySelector(g.sel);
      if (!el) continue;
      el.classList.add(g.strong ? "tutorial-target-strong" : "tutorial-target-medium");
    }
  }

  // -------- node / edge operations --------

  function _tutAddNode(label) {
    tutorialState.suppressedSteps.delete(tutorialState.currentStep);
    _tutResetIdleTimer();

    if (tutorialState.nodes.some(n => n.label === label)) {
      showToast(`${label} はすでに配置されています`, 1500);
      return;
    }

    const step = tutorialState.currentStep;
    const expectedLabel = step === 1 ? "A" : step === 3 ? "B" : step === 5 ? "C" : null;
    if (expectedLabel && label !== expectedLabel) {
      logOp("TUTORIAL_INVALID_ATTEMPT", {
        step, kind: "wrong_node",
        attempted: { label }, expected: { label: expectedLabel },
      });
      showToast(`まず ${expectedLabel} を追加してください`, 2000);
    }

    const count = tutorialState.nodes.length;
    const x = 20 + count * 100;
    const y = 20;
    const nodeId = "tn-" + uid();
    tutorialState.nodes.push({ id: nodeId, label, x, y, layerId: null });
    logOp("TUTORIAL_ADD_NODE", { step, label, nodeId });

    renderTutorial();
    tutorialCheckStepCompletion();
  }

  function _showTutEdgeLabelPopup(fromId, toId, clientX, clientY) {
    document.querySelectorAll(".tut-edge-popup").forEach(p => p.remove());
    const fn = tutorialState.nodes.find(n => n.id === fromId);
    const tn = tutorialState.nodes.find(n => n.id === toId);
    if (!fn || !tn) return;

    const popup = document.createElement("div");
    popup.className = "edge-label-popup tut-edge-popup";
    popup.style.left = Math.min(clientX, window.innerWidth - 310) + "px";
    popup.style.top  = Math.min(clientY, window.innerHeight - 220) + "px";

    const rowsHtml = EDGE_TYPES.map(t =>
      `<button class="edge-dir-btn" data-label="${esc(t.label)}" style="width:100%;border-color:${t.stroke}">
        <span class="dir-txt" style="color:${t.stroke}"><span class="ebdot" style="background:${t.stroke}"></span> ${esc(t.label)}</span>
        <span class="dir-sub">${esc(t.desc)}</span>
      </button>`
    ).join("");

    popup.innerHTML = `
      <div class="popup-title">矢印の種類を選択</div>
      <div class="popup-nodes">
        <span class="popup-node-chip from">${esc(fn.label)}</span>
        <span class="popup-node-arr">→</span>
        <span class="popup-node-chip to">${esc(tn.label)}</span>
      </div>
      <div class="popup-types" style="gap:6px">${rowsHtml}</div>
      <button class="popup-cancel">キャンセル</button>
    `;
    document.body.appendChild(popup);

    popup.querySelectorAll(".edge-dir-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        popup.remove();
        requestAnimationFrame(() => _tutAddEdge(fromId, toId, btn.dataset.label));
      });
    });
    popup.querySelector(".popup-cancel")?.addEventListener("click", () => popup.remove());

    setTimeout(() => {
      document.addEventListener("click", function closeP(e) {
        if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener("click", closeP); }
      });
    }, 100);
  }

  function _showTutEdgeChangePopup(edgeId, clientX, clientY) {
    document.querySelectorAll(".tut-edge-popup").forEach(p => p.remove());
    const edge = tutorialState.edges.find(e => e.id === edgeId);
    if (!edge) return;
    const fn = tutorialState.nodes.find(n => n.id === edge.fromId);
    const tn = tutorialState.nodes.find(n => n.id === edge.toId);

    const popup = document.createElement("div");
    popup.className = "edge-label-popup tut-edge-popup";
    popup.style.left = Math.min(clientX, window.innerWidth - 310) + "px";
    popup.style.top  = Math.min(clientY, window.innerHeight - 240) + "px";

    const rowsHtml = EDGE_TYPES.map(t => {
      const cur = edge.label === t.label ? " ✓" : "";
      return `<button class="edge-dir-btn" data-label="${esc(t.label)}" style="width:100%;border-color:${t.stroke}">
        <span class="dir-txt" style="color:${t.stroke}"><span class="ebdot" style="background:${t.stroke}"></span> ${esc(t.label)}${cur}</span>
        <span class="dir-sub">${esc(t.desc)}</span>
      </button>`;
    }).join("");

    popup.innerHTML = `
      <div class="popup-title">矢印の種類を変更</div>
      <div class="popup-nodes">
        <span class="popup-node-chip from">${esc(fn?.label || "")}</span>
        <span class="popup-node-arr">→</span>
        <span class="popup-node-chip to">${esc(tn?.label || "")}</span>
      </div>
      <div class="popup-types" style="gap:6px">${rowsHtml}</div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="popup-cancel tut-del-edge-btn" style="color:var(--red);border-color:rgba(255,90,106,0.4);">矢印を削除</button>
        <button class="popup-cancel tut-cancel-btn">キャンセル</button>
      </div>
    `;
    document.body.appendChild(popup);

    popup.querySelectorAll(".edge-dir-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const e = tutorialState.edges.find(x => x.id === edgeId);
        if (e) {
          e.label = btn.dataset.label;
          logOp("TUTORIAL_CHANGE_EDGE_LABEL", {
            step: tutorialState.currentStep, edgeId,
            newLabel: btn.dataset.label,
            fromLabel: fn?.label, toLabel: tn?.label,
          });
        }
        popup.remove();
        renderTutorial();
        tutorialCheckStepCompletion();
      });
    });
    popup.querySelector(".tut-del-edge-btn")?.addEventListener("click", () => {
      popup.remove();
      _tutDeleteEdge(edgeId);
    });
    popup.querySelector(".tut-cancel-btn")?.addEventListener("click", () => popup.remove());

    setTimeout(() => {
      document.addEventListener("click", function closeP(e) {
        if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener("click", closeP); }
      });
    }, 100);
  }

  function _tutAddEdge(fromId, toId, label) {
    tutorialState.suppressedSteps.delete(tutorialState.currentStep);
    _tutResetIdleTimer();

    const fromLabel = _tutLabelOf(tutorialState, fromId);
    const toLabel   = _tutLabelOf(tutorialState, toId);
    const step      = tutorialState.currentStep;

    tutorialState.edges = tutorialState.edges.filter(
      e => !(e.fromId === fromId && e.toId === toId)
    );
    const edgeId = "te-" + uid();
    tutorialState.edges.push({ id: edgeId, fromId, toId, label });
    logOp("TUTORIAL_ADD_EDGE", { step, fromLabel, toLabel, label, edgeId });

    const expected =
      step === 7 ? { from: "A", to: "B" } :
      step === 8 ? { from: "B", to: "C" } : null;
    if (expected && (fromLabel !== expected.from || toLabel !== expected.to)) {
      logOp("TUTORIAL_INVALID_ATTEMPT", {
        step, kind: "wrong_edge",
        attempted: { fromLabel, toLabel }, expected,
      });
      showToast(`${expected.from} から ${expected.to} へ矢印を引いてください`, 2500);
    }

    renderTutorial();
    tutorialCheckStepCompletion();
  }

  function _tutDeleteEdge(edgeId) {
    tutorialState.suppressedSteps.delete(tutorialState.currentStep);
    const edge = tutorialState.edges.find(e => e.id === edgeId);
    if (!edge) return;

    const fromLabel = _tutLabelOf(tutorialState, edge.fromId);
    const toLabel   = _tutLabelOf(tutorialState, edge.toId);
    tutorialState.edges = tutorialState.edges.filter(e => e.id !== edgeId);
    logOp("TUTORIAL_DELETE_EDGE", {
      step: tutorialState.currentStep, fromLabel, toLabel, label: edge.label, edgeId,
    });

    renderTutorial();
    tutorialCheckStepCompletion();
    _tutResetIdleTimer();
  }

  function _tutOnNodeDblClick(nodeId) {
    tutorialState.suppressedSteps.delete(tutorialState.currentStep);
    _tutResetIdleTimer();

    const canvas = tutDom.canvas;
    if (!canvas) return;

    const connected = new Set([nodeId]);
    tutorialState.edges.forEach(e => {
      if (e.fromId === nodeId) connected.add(e.toId);
      if (e.toId   === nodeId) connected.add(e.fromId);
    });

    canvas.querySelectorAll(".tut-node").forEach(el => {
      el.classList.remove("node-focus", "node-active", "node-dim");
      const id = el.dataset.id;
      if (id === nodeId)          el.classList.add("node-focus");
      else if (connected.has(id)) el.classList.add("node-active");
      else                        el.classList.add("node-dim");
    });

    const nodeData = tutorialState.nodes.find(n => n.id === nodeId);
    logOp("TUTORIAL_DBLCLICK", {
      step: tutorialState.currentStep,
      nodeLabel: nodeData?.label || "?",
      neighborCount: connected.size - 1,
    });

    tutorialState._lastDblClickedNodeId = nodeId;
    tutorialCheckStepCompletion();

    setTimeout(() => {
      document.addEventListener("click", function clearHL() {
        canvas.querySelectorAll(".tut-node").forEach(el =>
          el.classList.remove("node-focus", "node-active", "node-dim"));
        document.removeEventListener("click", clearHL);
      });
    }, 100);
  }

  // -------- step completion & auto-advance --------

  function tutorialCheckStepCompletion() {
    const step = tutorialState.currentStep;
    if (tutorialState.completedSteps.has(step)) return;
    if (tutorialState.suppressedSteps.has(step)) return;
    if (!tutorialState.startedAt) return;

    const stepDef = TUTORIAL_STEPS[step - 1];
    if (!stepDef) return;
    if (!stepDef.isComplete(tutorialState)) return;

    tutorialState.completedSteps.add(step);
    logOp("TUTORIAL_STEP_COMPLETE", {
      step, msSinceStart: Date.now() - (tutorialState._startedMs || Date.now()),
    });
    _renderTutProgress();
    debouncedSave();

    clearTimeout(_tutAutoAdvanceTimer);
    _tutAutoAdvanceTimer = setTimeout(
      () => tutorialAutoAdvance(step),
      stepDef.autoAdvanceDelay
    );
  }

  function tutorialAutoAdvance(fromStep) {
    if (tutorialState.currentStep !== fromStep) return;
    if (tutorialState.finishedAt) return;
    if (fromStep >= TUTORIAL_STEPS.length) { tutorialFinish(); return; }

    tutorialState.currentStep = fromStep + 1;
    logOp("TUTORIAL_STEP_ENTER", { step: tutorialState.currentStep });
    renderTutorial();
    debouncedSave();
    _tutResetIdleTimer();
  }

  function _tutResetIdleTimer() {
    clearTimeout(_tutIdleTimer);
    if (tutorialState.finishedAt) return;
    _tutIdleTimer = setTimeout(_tutOnIdle, TUTORIAL_IDLE_TIMEOUT_MS);
  }

  function _tutOnIdle() {
    const step = tutorialState.currentStep;
    if (tutorialState.completedSteps.has(step)) return;
    if (tutorialState.suppressedSteps.has(step)) return;

    tutorialState.skippedSteps.add(step);
    logOp("TUTORIAL_STEP_TIMEOUT_SKIP", { step, idleMs: TUTORIAL_IDLE_TIMEOUT_MS });
    debouncedSave();

    if (step >= TUTORIAL_STEPS.length) {
      tutorialFinish();
    } else {
      tutorialState.currentStep = step + 1;
      logOp("TUTORIAL_STEP_ENTER", { step: tutorialState.currentStep });
      renderTutorial();
      _tutResetIdleTimer();
    }
  }

  // -------- navigation --------

  function tutorialGoNext() {
    // internal API — called by tutorialAutoAdvance; not wired to any button
    const cur = tutorialState.currentStep;
    if (!tutorialState.completedSteps.has(cur)) {
      tutorialState.skippedSteps.add(cur);
      logOp("TUTORIAL_STEP_SKIP", { step: cur });
    }
    if (cur >= TUTORIAL_STEPS.length) { tutorialFinish(); return; }
    tutorialState.currentStep = cur + 1;
    logOp("TUTORIAL_STEP_ENTER", { step: tutorialState.currentStep });
    renderTutorial();
    debouncedSave();
  }

  function tutorialGoBack() {
    const cur = tutorialState.currentStep;
    if (cur <= 1) return;

    clearTimeout(_tutAutoAdvanceTimer);
    tutorialState.currentStep = cur - 1;
    tutorialState.suppressedSteps.add(tutorialState.currentStep);

    logOp("TUTORIAL_BACK", { fromStep: cur, toStep: tutorialState.currentStep });
    renderTutorial();
    debouncedSave();
    _tutResetIdleTimer();
  }

  function tutorialSkipAll() {
    clearTimeout(_tutAutoAdvanceTimer);
    clearTimeout(_tutIdleTimer);
    tutorialState.skippedAll = true;
    for (let s = tutorialState.currentStep; s <= TUTORIAL_STEPS.length; s++) {
      if (!tutorialState.completedSteps.has(s)) tutorialState.skippedSteps.add(s);
    }
    logOp("TUTORIAL_SKIP_ALL", { atStep: tutorialState.currentStep });
    tutorialFinish();
    debouncedSave();
  }

  function tutorialFinish() {
    if (tutorialState.finishedAt) return;
    clearTimeout(_tutAutoAdvanceTimer);
    clearTimeout(_tutIdleTimer);
    tutorialState.finishedAt = new Date().toISOString();
    const totalMs = Date.now() - (tutorialState._startedMs || Date.now());
    logOp("TUTORIAL_FINISH", {
      completedCount: tutorialState.completedSteps.size,
      skippedCount:   tutorialState.skippedSteps.size,
      totalMs,
    });
    const btn = $("btnStartMap");
    if (btn) { btn.disabled = false; btn.setAttribute("aria-disabled", "false"); }
    const hint = $("startMapHint"); if (hint) hint.style.display = "none";
    renderTutorialAsCompleted();
    saveToLocalStorage();
  }

  function renderTutorialAsCompleted() {
    const prog = $("tutProgress");
    if (prog) {
      prog.innerHTML = "";
      for (let i = 1; i <= TUTORIAL_STEPS.length; i++) {
        const dot = document.createElement("span");
        dot.className = "tut-progress-dot done";
        dot.textContent = "✓";
        prog.appendChild(dot);
      }
    }
    const instr = $("tutInstruction");
    if (instr) instr.innerHTML = "チュートリアルを完了しました。「学習を開始する →」をクリックして本番へ進んでください。";
    const stepNum = $("tutStepNumCurrent");
    if (stepNum) stepNum.textContent = String(TUTORIAL_STEPS.length);
    [$("tutPrev"), $("tutSkip")].forEach(btn => {
      if (btn) btn.style.display = "none";
    });
    const canvas = $("tutCanvas");
    if (canvas) canvas.style.pointerEvents = "none";
    const pal = $("tutPalette");
    if (pal) pal.style.pointerEvents = "none";
  }

  // ================================================================
  // INIT
  // ================================================================
  function init() {
    const cfg = MAP_PHASE_CONFIG[1];  // 急性期
    activePhaseKey     = cfg.key;
    activePaletteNodes = cfg.paletteNodes;
    BENEFICIARY_LABELS = cfg.beneficiaries;
    canvasEl           = $(cfg.domIds.canvas);
    svgEl              = $(cfg.domIds.svg);
    paletteEl          = $(cfg.domIds.palette);
    canvasWrap         = $(cfg.domIds.wrap);
    activeCanvasStatEl = $(cfg.domIds.stat);
    activeArrowHintEl  = $(cfg.domIds.hint);
    activeMarkerSuffix = cfg.markerSuffix;

    state.sessionId      = generateSessionId();
    state.operationLog   = [];
    state.phaseStartTime = Date.now();

    renderPalette();
    wireEvents();
    initTutorial();
    renderAll();
    logOp("INIT", {
      scenarioId: SCENARIO.id, scenarioVersion: CONTENT_VERSIONS.scenario,
      flowVersion: FLOW_VERSION, hintTextsVersion: HINT_TEXTS_VERSION,
      scoringRuleVersion: window.__ICS_SCORING__?.version ?? null, // [ADDED axis4]
    });
    idealAcuteLoadPromise = loadIdealMapAcute();
    idealRecoveryLoadPromise = loadIdealMapRecovery();
    loadActualMapAcute();
    loadActualMapRecovery();
  }

  init();

  // ── localStorage 復元フロー ────────────────────────────────────────
  (async function restoreFromStorage() {
    const saved = loadFromLocalStorage();
    if (saved) {
      const savedAt = new Date(saved.savedAt).toLocaleString();
      if (confirm(`前回の作業（${savedAt} 保存）を復元しますか？\n「キャンセル」を選ぶと前回の作業は破棄され、新しいセッションとして開始します。`)) {
        state.sessionId      = saved.sessionId      || generateSessionId();
        state.operationLog   = saved.operationLog   || [];
        state.phaseStartTime = Date.now();  // 復元時刻にリセット（異常滞在時間を防ぐ）
        state.acuteSubPhase  = saved.acuteSubPhase  ?? null;
        state.tooltipEnabled = saved.tooltipEnabled ?? true;
        if (saved.phaseStartTime) {
          logOp("RESUMED_FROM_STORAGE", {
            previousPhaseStartTime: saved.phaseStartTime,
            gapMs: Date.now() - saved.phaseStartTime,
            operationLogCount: state.operationLog.length
          });
        }
        Object.assign(phaseData, saved.phaseData);
        if (saved.phase5Data) Object.assign(window.phase5Data, saved.phase5Data);
        // 規範マップのロード完了を待ってから復元する（採点が未定義規範マップで
        // スキップされ、空のウォークスルーが表示されるのを防ぐ）
        if (idealAcuteLoadPromise) await idealAcuteLoadPromise;

        // [ADDED flow-v2] 廃止フェーズ（Phase 11/13）で保存されたセッションはwalkthrough側へ
        // リダイレクトする。13で保存＝snap未実行の可能性があるため、walkthroughからやり直させて
        // 退出時snapに乗せる。
        const FLOW_V2_REDIRECT = {
          [PHASE.ACUTE_REVISE]:       PHASE.ACUTE_DIFF,
          [PHASE.ACUTE_LAYER_REVISE]: PHASE.ACUTE_LAYER_DIFF,
        };
        let restorePhase = saved.currentPhase ?? PHASE.ORIENTATION;
        if (FLOW_V2_REDIRECT[restorePhase] != null) {
          const redirectedTo = FLOW_V2_REDIRECT[restorePhase];
          logOp("FLOW_REDIRECT", { from: restorePhase, to: redirectedTo, reason: "flow-v2" });
          restorePhase = redirectedTo;
        }
        switchPhase(restorePhase);
      } else {
        clearLocalStorage();
      }
      // operationLog 確定後、完遂判定 → UI 更新
      if (tutorialHasFinishedEarlier()) {
        renderTutorialAsCompleted();
        const btn = $("btnStartMap");
        if (btn) { btn.disabled = false; btn.setAttribute("aria-disabled", "false"); }
        const hint = $("startMapHint"); if (hint) hint.style.display = "none";
      }
    }
    // Phase 0 に居て未完遂なら TUTORIAL_START
    tutorialBeginIfVisible();
  })();

  // 被験者切替・実験者向け運用 API
  window.__icsClearStorage = clearLocalStorage;

  window.addEventListener("blur", () => { logOp("WINDOW_BLUR", {}); });
  window.addEventListener("focus", () => { logOp("WINDOW_FOCUS", {}); });
  document.addEventListener("visibilitychange", () => {
    logOp("VISIBILITY_CHANGE", { state: document.visibilityState });
  });

  window.addEventListener("beforeunload", (e) => {
    if (hasUnsavedWork()) {
      e.preventDefault();
      e.returnValue = ""; // Chrome が要求
    }
  });
})();
