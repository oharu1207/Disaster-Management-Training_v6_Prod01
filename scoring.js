/**
 * scoring.js - 急性期マップ採点エンジン
 * 仕様: critical_edge_scoring_spec_rev4.md
 * スコープ: 純粋ロジック。app.js / DOM / localStorage に依存しない。
 * 公開窓口: window.__ICS_SCORING__ = { normalizeMap, gradeAcuteMap, auditIdealConsistency, version }
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // 正規化層  id → label 変換はこの関数だけが担う
  // ═══════════════════════════════════════════════════════════

  /**
   * rawMap { nodes, edges } を label 世界へ変換する。
   * @throws {Error} ラベル重複時
   * @returns {{ nodes: {label,layerId}[], edges: {fromLabel,toLabel,label,bidirectional}[] }}
   */
  function normalizeMap(rawMap) {
    const { nodes, edges } = rawMap;

    // ラベル重複チェック
    const seen = new Set();
    for (const n of nodes) {
      if (seen.has(n.label)) throw new Error(`Duplicate node label: "${n.label}"`);
      seen.add(n.label);
    }

    // id → label 辞書
    const idToLabel = new Map();
    for (const n of nodes) idToLabel.set(n.id, n.label);

    const normNodes = nodes.map(n => ({ label: n.label, layerId: n.layerId != null ? n.layerId : null }));

    // 解決できないエッジは捨てる（削除途中の不整合に備える）
    const normEdges = [];
    for (const e of edges) {
      const fromLabel = idToLabel.get(e.from);
      const toLabel   = idToLabel.get(e.to);
      if (fromLabel === undefined || toLabel === undefined) continue;
      normEdges.push({ fromLabel, toLabel, label: e.label, bidirectional: !!e.bidirectional });
    }

    return { nodes: normNodes, edges: normEdges };
  }

  // ═══════════════════════════════════════════════════════════
  // 定数
  // ═══════════════════════════════════════════════════════════

  const ICS_PURE         = 'ics_pure';
  const DOMAIN_INTEGRATED = 'domain_integrated';

  // 採点規則の版識別（spec §6.3）。軸4追加により満点基準が変わるため機械可読に残す。
  const SCORING_RULE_VERSION = 'grade-v2-cpe';

  // error category → principleGroup マッピング (spec §4)
  const CATEGORY_GROUP = {
    layer_mismatch:          ICS_PURE,
    command_overuse:         ICS_PURE,
    command_missing:         ICS_PURE,
    hub_misassignment:       DOMAIN_INTEGRATED,
    edge_label_error:        ICS_PURE,
    support_missing:         DOMAIN_INTEGRATED,
    support_overuse:         DOMAIN_INTEGRATED,
    support_layer_violation: ICS_PURE,
    coordination_path_error: DOMAIN_INTEGRATED,
  };

  // 3ハブ (spec §0)
  const HUBS = new Set(['C県A保健所', '地域災害医療コーディネーター', '市町村保健センター']);

  // 無向ペアキー（辞書順ソート + 区切り文字）
  function pairKey(a, b) { return a <= b ? `${a}|||${b}` : `${b}|||${a}`; }

  // 軸1: 理想指示命令エッジ（有向 "from|to"）(spec §3.2)
  const IDEAL_COMMAND_EDGES = new Set([
    '県庁|C県A保健所',
    'C県A保健所|DHEAT',
  ]);

  // 理想指揮ペア（無向）。このペア上のエッジはラベル不問で軸1管轄（spec §3.6.3 J2）
  const IDEAL_COMMAND_PAIRS = new Set([
    pairKey('県庁', 'C県A保健所'),
    pairKey('C県A保健所', 'DHEAT'),
  ]);

  // 軸2: 理想ハブ接続（無向ペア、重複排除済み）(spec §3.3)
  const IDEAL_HUB_PAIRS_RAW = [
    // C県A保健所 ハブ
    ['C県A保健所', '医師会'],
    ['C県A保健所', '歯科医師会'],
    ['C県A保健所', 'AB薬剤師会'],
    ['C県A保健所', 'W民間団体'],
    ['C県A保健所', '市町村保健センター'],
    ['C県A保健所', '地域災害医療コーディネーター'],
    // 地域災害医療コーディネーター ハブ（保健所との接続は上記と共通）
    ['地域災害医療コーディネーター', 'DMAT'],
    ['地域災害医療コーディネーター', 'JMAT'],
    ['地域災害医療コーディネーター', 'DPAT'],
    ['地域災害医療コーディネーター', 'C県看護協会'],
    // 市町村保健センター ハブ（保健所との接続は上記と共通）
    ['市町村保健センター', 'DWAT'],
    ['市町村保健センター', 'JRAT'],
    ['市町村保健センター', '地域包括支援センター'],
    ['市町村保健センター', 'C県栄養士会'],
  ];

  // pairKey → [a, b] マップ
  const IDEAL_HUB_MAP = new Map();
  for (const [a, b] of IDEAL_HUB_PAIRS_RAW) IDEAL_HUB_MAP.set(pairKey(a, b), [a, b]);

  // 軸3: 理想支援エッジ（有向 "from|to"、すべて L3→L4）(spec §3.4)
  const IDEAL_SUPPORT_EDGES = new Set([
    'DMAT|医療機関', 'DPAT|医療機関', '医師会|医療機関', 'C県看護協会|医療機関', '歯科医師会|医療機関',
    'DMAT|避難所', 'DPAT|避難所', 'JMAT|避難所', '医師会|避難所',
    '歯科医師会|避難所', 'AB薬剤師会|避難所', 'C県看護協会|避難所',
    'DWAT|避難所', 'JRAT|避難所', '地域包括支援センター|避難所',
    'C県栄養士会|避難所', 'W民間団体|避難所',
  ]);

  // J4（spec §3.7.6）: 理想支援エッジの無向ペア集合。IDEAL_SUPPORT_EDGES から機械的に導出する
  // （独立の真実を持たない導出定数。auditIdealConsistency の比較対象には含めない）。
  const IDEAL_SUPPORT_PAIRS_UNDIRECTED = new Set(
    [...IDEAL_SUPPORT_EDGES].map(key => { const [f, t] = key.split('|'); return pairKey(f, t); })
  );

  /**
   * 理想マップ（正規化済み）とハードコード定数の整合性を検査する。
   * 副作用なし。ログ記録は呼び出し側の責務。
   * IDEAL_COMMAND_EDGES / IDEAL_HUB_MAP / IDEAL_SUPPORT_EDGES は仕様書§3.2〜§3.4の
   * 写像として意図的にハードコードされている（動的導出はしない設計判断）。
   * 配信JSONの差し替え事故等でこれらが実際の理想マップとずれた場合に検出するための監査。
   * 情報伝達エッジはJ3により採点対象外のため検査しない。
   * @param {ReturnType<normalizeMap>} idealNorm
   * @returns {{ ok: boolean, mismatches: string[] }}
   */
  function auditIdealConsistency(idealNorm) {
    const mismatches = [];

    // 軸1: 指示命令（有向 from|to）
    const jsonCommand = new Set();
    for (const e of idealNorm.edges) {
      if (e.label === '指示命令') jsonCommand.add(`${e.fromLabel}|${e.toLabel}`);
    }
    for (const key of jsonCommand) {
      if (!IDEAL_COMMAND_EDGES.has(key)) mismatches.push(`指示命令: 定数に無い→ ${key}`);
    }
    for (const key of IDEAL_COMMAND_EDGES) {
      if (!jsonCommand.has(key)) mismatches.push(`指示命令: JSONに無い→ ${key}`);
    }

    // 軸2: ハブ接続（無向ペア。pairKey で正規化）
    const jsonHub = new Set();
    for (const e of idealNorm.edges) {
      if (e.label === '連携協力') jsonHub.add(pairKey(e.fromLabel, e.toLabel));
    }
    for (const key of jsonHub) {
      if (!IDEAL_HUB_MAP.has(key)) mismatches.push(`ハブ: 定数に無い→ ${key}`);
    }
    for (const key of IDEAL_HUB_MAP.keys()) {
      if (!jsonHub.has(key)) mismatches.push(`ハブ: JSONに無い→ ${key}`);
    }

    // 軸3: 支援（有向 from|to）
    const jsonSupport = new Set();
    for (const e of idealNorm.edges) {
      if (e.label === '支援') jsonSupport.add(`${e.fromLabel}|${e.toLabel}`);
    }
    for (const key of jsonSupport) {
      if (!IDEAL_SUPPORT_EDGES.has(key)) mismatches.push(`支援: 定数に無い→ ${key}`);
    }
    for (const key of IDEAL_SUPPORT_EDGES) {
      if (!jsonSupport.has(key)) mismatches.push(`支援: JSONに無い→ ${key}`);
    }

    return { ok: mismatches.length === 0, mismatches };
  }

  // ═══════════════════════════════════════════════════════════
  // ヘルパー
  // ═══════════════════════════════════════════════════════════

  function makeError(category, detail) {
    return { category, principleGroup: CATEGORY_GROUP[category], detail };
  }

  // ハブペアから周辺ノード（非ハブ端）を返す。両端ハブまたは両端非ハブなら null。
  function getPeripheral(a, b) {
    const aHub = HUBS.has(a), bHub = HUBS.has(b);
    if (aHub && !bHub) return b;
    if (bHub && !aHub) return a;
    return null;
  }

  // ═══════════════════════════════════════════════════════════
  // メインエンジン
  // ═══════════════════════════════════════════════════════════

  /**
   * 正規化済みマップを採点する純関数。引数以外の状態を読まない。
   * @param {ReturnType<normalizeMap>} learnerNorm
   * @param {ReturnType<normalizeMap>} idealNorm
   */
  function gradeAcuteMap(learnerNorm, idealNorm) {
    const errors = [];

    // 理想 layerId 辞書
    const idealLayerMap = new Map();
    for (const n of idealNorm.nodes) idealLayerMap.set(n.label, n.layerId);

    // L4 固定ノード集合（分母別管理用 spec §2.3）
    const L4_LABELS = new Set();
    for (const n of idealNorm.nodes) { if (n.layerId === 4) L4_LABELS.add(n.label); }

    // ── 系統A: レイヤー検出 ──────────────────────────────────
    for (const n of learnerNorm.nodes) {
      if (!idealLayerMap.has(n.label)) continue; // 理想に存在しないノードはスキップ
      if (L4_LABELS.has(n.label)) continue;       // L4 固定ノードは常に正答（spec §2.2）

      const expected = idealLayerMap.get(n.label);
      const actual   = n.layerId;
      if (actual !== expected) {
        // null（未設定）も誤りとして安全側に倒す（spec §3.1 補足）
        errors.push(makeError('layer_mismatch', { label: n.label, expected, got: actual }));
      }
    }

    // ── 系統B 軸1: 指示命令エッジ ────────────────────────────
    const learnerCommandSet = new Set();
    for (const e of learnerNorm.edges) {
      if (e.label === '指示命令') learnerCommandSet.add(`${e.fromLabel}|${e.toLabel}`);
    }
    for (const key of IDEAL_COMMAND_EDGES) {
      if (!learnerCommandSet.has(key)) {
        const [f, t] = key.split('|');
        errors.push(makeError('command_missing', { fromLabel: f, toLabel: t }));
      }
    }
    // J1例外判定用: 学習者の連携協力エッジ（無向ペアキー）
    const learnerCoopPairs = new Set();
    for (const e of learnerNorm.edges) {
      if (e.label === '連携協力') learnerCoopPairs.add(pairKey(e.fromLabel, e.toLabel));
    }
    for (const key of learnerCommandSet) {
      if (IDEAL_COMMAND_EDGES.has(key)) continue;
      const [f, t] = key.split('|');
      const pk = pairKey(f, t);
      // J1: 理想ハブペア上の指示命令は軸2管轄（edge_label_error）。
      //     ただし正しい連携協力が併存する場合は純粋な過剰として軸1で数える。
      if (IDEAL_HUB_MAP.has(pk) && !learnerCoopPairs.has(pk)) continue;
      errors.push(makeError('command_overuse', { fromLabel: f, toLabel: t }));
    }

    // ── 系統B 軸2: ハブ接続エッジ ────────────────────────────
    errors.push(...gradeAxis2(learnerNorm));

    // ── 系統B 軸3: 支援エッジ ────────────────────────────────
    errors.push(...gradeAxis3(learnerNorm, idealLayerMap));

    // ── 系統B 軸4: 調整経路（非ハブ間連携協力） ──────────────
    errors.push(...gradeAxis4(learnerNorm));

    // 集計
    const counts = {
      layer_mismatch: 0, command_overuse: 0, command_missing: 0,
      hub_misassignment: 0, edge_label_error: 0,
      support_missing: 0, support_overuse: 0, support_layer_violation: 0,
      coordination_path_error: 0,
    };
    for (const e of errors) counts[e.category]++;

    const subscores = {
      ics_pure:          errors.filter(e => e.principleGroup === ICS_PURE).length,
      domain_integrated: errors.filter(e => e.principleGroup === DOMAIN_INTEGRATED).length,
    };

    return {
      errors,
      counts,
      subscores,
      meta: { fixedNodeCount: L4_LABELS.size },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 軸2: ハブ接続採点
  // ═══════════════════════════════════════════════════════════

  function gradeAxis2(learnerNorm) {
    const errors = [];

    // J1例外判定用: 学習者の連携協力エッジ（無向ペアキー）。軸1と同じ計算だが、
    // gradeAxis2 は learnerNorm のみを引数に取る独立関数のため軸1の集合を共有せず再計算する。
    const learnerCoopPairsA2 = new Set();
    for (const e of learnerNorm.edges) {
      if (e.label === '連携協力') learnerCoopPairsA2.add(pairKey(e.fromLabel, e.toLabel));
    }

    // ハブ関連エッジを抽出（判定管轄規則 spec §3.6.3）
    const learnerHubEdges = [];
    for (const e of learnerNorm.edges) {
      if (e.label === '支援') continue;                       // 支援は軸3管轄
      const key = pairKey(e.fromLabel, e.toLabel);
      if (IDEAL_COMMAND_PAIRS.has(key)) continue;             // J2: 理想指揮ペアは軸1管轄
      if (!HUBS.has(e.fromLabel) && !HUBS.has(e.toLabel)) continue;
      if (e.label === '情報伝達' && !IDEAL_HUB_MAP.has(key)) continue;  // J3: ハブペア外の情報伝達は対象外
      if (e.label === '指示命令') {
        if (!IDEAL_HUB_MAP.has(key)) continue;                // J1: ハブペア外の指示命令は軸1管轄
        if (learnerCoopPairsA2.has(key)) continue;            // J1例外: 連携協力併存 → 軸1管轄
      }
      learnerHubEdges.push({
        fromLabel: e.fromLabel, toLabel: e.toLabel,
        label: e.label, key,
      });
    }

    // 第1パス: 理想ペアと一致する学習者エッジを照合し、ラベルチェック
    const usedIdealPairs    = new Set(); // 消費済み理想ペアキー
    const learnerAccounted  = new Set(); // 照合済み学習者エッジのインデックス

    for (let i = 0; i < learnerHubEdges.length; i++) {
      const le = learnerHubEdges[i];
      if (IDEAL_HUB_MAP.has(le.key) && !usedIdealPairs.has(le.key)) {
        usedIdealPairs.add(le.key);
        learnerAccounted.add(i);
        if (le.label !== '連携協力') {
          errors.push(makeError('edge_label_error', {
            fromLabel: le.fromLabel, toLabel: le.toLabel,
            expectedLabel: '連携協力', gotLabel: le.label,
          }));
        }
      }
    }

    // 未消費の理想ペア = missing候補
    const missingPairKeys = [...IDEAL_HUB_MAP.keys()].filter(k => !usedIdealPairs.has(k));

    // peripheral → missing ペアキー配列（スワップ検出用）
    const peripheralToMissing = new Map();
    for (const k of missingPairKeys) {
      const [a, b] = IDEAL_HUB_MAP.get(k);
      const peripheral = getPeripheral(a, b);
      if (peripheral) {
        if (!peripheralToMissing.has(peripheral)) peripheralToMissing.set(peripheral, []);
        peripheralToMissing.get(peripheral).push(k);
      }
    }

    const consumedMissing = new Set(); // スワップで消費した missingペアキー

    // 第2パス: 未照合の学習者エッジをスワップ or 過剰として処理
    for (let i = 0; i < learnerHubEdges.length; i++) {
      if (learnerAccounted.has(i)) continue;
      const le = learnerHubEdges[i];
      const peripheral = getPeripheral(le.fromLabel, le.toLabel);

      if (peripheral && peripheralToMissing.has(peripheral)) {
        const candidates = peripheralToMissing.get(peripheral).filter(k => !consumedMissing.has(k));
        if (candidates.length > 0) {
          // スワップ確定: missing 1件を消費し、1誤りに正規化 (spec §3.1-2, §3.5)
          consumedMissing.add(candidates[0]);
          const [a, b] = IDEAL_HUB_MAP.get(candidates[0]);
          errors.push(makeError('hub_misassignment', {
            type: 'swap',
            peripheral,
            correctHub: HUBS.has(a) ? a : b,
            wrongHub:   HUBS.has(le.fromLabel) ? le.fromLabel : le.toLabel,
          }));
          continue;
        }
      }
      // スワップ非該当 → 過剰
      errors.push(makeError('hub_misassignment', {
        type: 'overuse', fromLabel: le.fromLabel, toLabel: le.toLabel,
      }));
    }

    // 残存 missing（スワップで消費されなかったもの）
    for (const k of missingPairKeys) {
      if (!consumedMissing.has(k)) {
        const [a, b] = IDEAL_HUB_MAP.get(k);
        errors.push(makeError('hub_misassignment', { type: 'missing', fromLabel: a, toLabel: b }));
      }
    }

    return errors;
  }

  // ═══════════════════════════════════════════════════════════
  // 軸3: 支援エッジ採点
  // ═══════════════════════════════════════════════════════════

  function gradeAxis3(learnerNorm, idealLayerMap) {
    const errors = [];
    const learnerValidSupport = new Set(); // 第1段階通過済み学習者支援エッジキー

    for (const e of learnerNorm.edges) {
      if (e.label !== '支援') continue;

      const fromLayerId = idealLayerMap.get(e.fromLabel);

      // 第1段階: L3 チェック (spec §3.4)
      // 接続元が理想マップに存在しない場合も安全側（L3違反）として扱う
      if (fromLayerId === undefined || fromLayerId !== 3) {
        errors.push(makeError('support_layer_violation', {
          fromLabel: e.fromLabel, toLabel: e.toLabel, fromLayerId: fromLayerId ?? null,
        }));
        continue; // 第2段階に進まない
      }

      // 第2段階: 正誤照合用に収集
      learnerValidSupport.add(`${e.fromLabel}|${e.toLabel}`);
    }

    // 欠落
    for (const key of IDEAL_SUPPORT_EDGES) {
      if (!learnerValidSupport.has(key)) {
        const [f, t] = key.split('|');
        errors.push(makeError('support_missing', { fromLabel: f, toLabel: t }));
      }
    }

    // 過剰（支援エッジに edge_label_error は発生しない: spec §3.4）
    for (const key of learnerValidSupport) {
      if (!IDEAL_SUPPORT_EDGES.has(key)) {
        const [f, t] = key.split('|');
        errors.push(makeError('support_overuse', { fromLabel: f, toLabel: t }));
      }
    }

    // TODO(future): 情報伝達エッジの下向き ICS 違反検出（将来拡張ポイント）

    return errors;
  }

  // ═══════════════════════════════════════════════════════════
  // 軸4: 調整経路採点（非ハブ間連携協力） spec §3.5
  // ═══════════════════════════════════════════════════════════

  function gradeAxis4(learnerNorm) {
    const errors = [];
    for (const e of learnerNorm.edges) {
      if (e.label !== '連携協力') continue;                       // 対象は連携協力のみ
      if (HUBS.has(e.fromLabel) || HUBS.has(e.toLabel)) continue; // 片端でもハブなら軸2管轄
      const pk = pairKey(e.fromLabel, e.toLabel);
      if (IDEAL_SUPPORT_PAIRS_UNDIRECTED.has(pk)) continue;       // J4: 理想支援ペア上は軸3で捕捉済み
      const subtype = (e.fromLabel === 'DHEAT' || e.toLabel === 'DHEAT')
        ? 'command_support_as_hub'
        : 'lateral_coordination';
      errors.push(makeError('coordination_path_error', {
        fromLabel: e.fromLabel, toLabel: e.toLabel, subtype,
      }));
    }
    return errors;
  }

  // ═══════════════════════════════════════════════════════════
  // エクスポート
  // ═══════════════════════════════════════════════════════════

  const _exports = { normalizeMap, gradeAcuteMap, auditIdealConsistency, version: SCORING_RULE_VERSION };

  if (typeof window !== 'undefined') {
    window.__ICS_SCORING__ = _exports;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = _exports;
  }

  // ═══════════════════════════════════════════════════════════
  // テストハーネス (spec §6)
  // ブラウザ: window.__SCORING_TEST__() を呼ぶ
  // Node:    node scoring.js で自動実行
  // ═══════════════════════════════════════════════════════════

  // 理想正規化マップ（ideal_map_acute.json の正確な内容から構築）
  const IDEAL_NORM = {
    nodes: [
      { label: '避難所',                  layerId: 4 },
      { label: '医療機関',                layerId: 4 },
      { label: '県庁',                    layerId: 1 },
      { label: 'C県A保健所',              layerId: 1 },
      { label: 'DMAT',                    layerId: 3 },
      { label: 'DHEAT',                   layerId: 2 },
      { label: 'DPAT',                    layerId: 3 },
      { label: 'DWAT',                    layerId: 3 },
      { label: 'JMAT',                    layerId: 3 },
      { label: 'JRAT',                    layerId: 3 },
      { label: 'C県看護協会',             layerId: 3 },
      { label: '医師会',                  layerId: 3 },
      { label: '歯科医師会',              layerId: 3 },
      { label: 'AB薬剤師会',              layerId: 3 },
      { label: 'C県栄養士会',             layerId: 3 },
      { label: '地域包括支援センター',    layerId: 3 },
      { label: 'W民間団体',               layerId: 3 },
      { label: '市町村保健センター',      layerId: 2 },
      { label: '地域災害医療コーディネーター', layerId: 2 },
    ],
    edges: [
      // 指示命令
      { fromLabel: '県庁',         toLabel: 'C県A保健所', label: '指示命令', bidirectional: false },
      { fromLabel: 'C県A保健所',   toLabel: 'DHEAT',      label: '指示命令', bidirectional: false },
      // 保健所ハブ接続
      { fromLabel: 'C県A保健所', toLabel: '医師会',                  label: '連携協力', bidirectional: true },
      { fromLabel: 'C県A保健所', toLabel: '歯科医師会',              label: '連携協力', bidirectional: true },
      { fromLabel: 'C県A保健所', toLabel: 'AB薬剤師会',              label: '連携協力', bidirectional: true },
      { fromLabel: 'C県A保健所', toLabel: '地域災害医療コーディネーター', label: '連携協力', bidirectional: true },
      { fromLabel: 'C県A保健所', toLabel: 'W民間団体',               label: '連携協力', bidirectional: true },
      { fromLabel: 'C県A保健所', toLabel: '市町村保健センター',      label: '連携協力', bidirectional: true },
      // コーディネーターハブ接続
      { fromLabel: '地域災害医療コーディネーター', toLabel: 'DMAT',       label: '連携協力', bidirectional: true },
      { fromLabel: '地域災害医療コーディネーター', toLabel: 'DPAT',       label: '連携協力', bidirectional: true },
      { fromLabel: '地域災害医療コーディネーター', toLabel: 'C県看護協会', label: '連携協力', bidirectional: true },
      { fromLabel: '地域災害医療コーディネーター', toLabel: 'JMAT',       label: '連携協力', bidirectional: true },
      // 市町村ハブ接続
      { fromLabel: '市町村保健センター', toLabel: 'JRAT',             label: '連携協力', bidirectional: true },
      { fromLabel: '市町村保健センター', toLabel: 'DWAT',             label: '連携協力', bidirectional: true },
      { fromLabel: '市町村保健センター', toLabel: '地域包括支援センター', label: '連携協力', bidirectional: true },
      { fromLabel: '市町村保健センター', toLabel: 'C県栄養士会',      label: '連携協力', bidirectional: true },
      // 支援 → 医療機関
      { fromLabel: 'DMAT',       toLabel: '医療機関', label: '支援', bidirectional: false },
      { fromLabel: 'DPAT',       toLabel: '医療機関', label: '支援', bidirectional: false },
      { fromLabel: '医師会',     toLabel: '医療機関', label: '支援', bidirectional: false },
      { fromLabel: 'C県看護協会', toLabel: '医療機関', label: '支援', bidirectional: false },
      { fromLabel: '歯科医師会', toLabel: '医療機関', label: '支援', bidirectional: false },
      // 支援 → 避難所
      { fromLabel: 'DMAT',           toLabel: '避難所', label: '支援', bidirectional: false },
      { fromLabel: 'DPAT',           toLabel: '避難所', label: '支援', bidirectional: false },
      { fromLabel: 'JMAT',           toLabel: '避難所', label: '支援', bidirectional: false },
      { fromLabel: '医師会',         toLabel: '避難所', label: '支援', bidirectional: false },
      { fromLabel: '歯科医師会',     toLabel: '避難所', label: '支援', bidirectional: false },
      { fromLabel: 'AB薬剤師会',     toLabel: '避難所', label: '支援', bidirectional: false },
      { fromLabel: 'C県看護協会',    toLabel: '避難所', label: '支援', bidirectional: false },
      { fromLabel: 'DWAT',           toLabel: '避難所', label: '支援', bidirectional: false },
      { fromLabel: 'JRAT',           toLabel: '避難所', label: '支援', bidirectional: false },
      { fromLabel: '地域包括支援センター', toLabel: '避難所', label: '支援', bidirectional: false },
      { fromLabel: 'C県栄養士会',    toLabel: '避難所', label: '支援', bidirectional: false },
      { fromLabel: 'W民間団体',      toLabel: '避難所', label: '支援', bidirectional: false },
      // 情報伝達（採点対象外）
      { fromLabel: 'C県A保健所', toLabel: '県庁',       label: '情報伝達', bidirectional: false },
      { fromLabel: 'DHEAT',      toLabel: 'C県A保健所', label: '情報伝達', bidirectional: false },
    ],
  };

  // ── テスト支援ユーティリティ ──

  // IDEAL_NORM をベースに edges を差分編集した learnerNorm を返す
  function buildLearner({ removeEdges = [], addEdges = [], changeNodes = [] } = {}) {
    const removeKeys = new Set(removeEdges.map(e => `${e.fromLabel}|${e.toLabel}|${e.label}`));
    const edges = IDEAL_NORM.edges.filter(e => !removeKeys.has(`${e.fromLabel}|${e.toLabel}|${e.label}`));
    edges.push(...addEdges);

    const labelChanges = new Map(changeNodes.map(c => [c.label, c]));
    const nodes = IDEAL_NORM.nodes.map(n => {
      if (labelChanges.has(n.label)) return Object.assign({}, n, labelChanges.get(n.label));
      return n;
    });

    return { nodes, edges };
  }

  function runScoringTests() {
    let passed = 0, failed = 0;

    function check(name, condition, expected, actual) {
      if (condition) {
        console.log(`  ✓ ${name}`);
        passed++;
      } else {
        console.error(`  ✗ ${name}\n    expected: ${JSON.stringify(expected)}\n    got:      ${JSON.stringify(actual)}`);
        failed++;
      }
    }

    console.log('[scoring.js] テスト開始');

    // ─── Test 1: 満点ケース ──────────────────────────────────
    {
      const r = gradeAcuteMap(IDEAL_NORM, IDEAL_NORM);
      const allZero = Object.values(r.counts).every(v => v === 0);
      check('T1: errors 空', r.errors.length === 0, 0, r.errors.length);
      check('T1: counts 全0', allZero, true, r.counts);
    }

    // ─── Test 2: レイヤー誤り ────────────────────────────────
    {
      const learner = buildLearner({ changeNodes: [{ label: 'DMAT', layerId: 1 }] });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      check('T2: layer_mismatch = 1', r.counts.layer_mismatch === 1, 1, r.counts.layer_mismatch);
    }

    // ─── Test 3: 指示命令 過剰 ──────────────────────────────
    // 注: 正解の連携協力と余分な指示命令の同一ペア共存は、UIのペア排他ガードにより
    // 学習者操作では到達不能な合成状態（spec §3.6.5）。インポート由来の任意入力に
    // 対するエンジン防御（J1例外）の回帰テストとして維持する。
    {
      const learner = buildLearner({
        addEdges: [{ fromLabel: '地域災害医療コーディネーター', toLabel: 'DMAT', label: '指示命令', bidirectional: false }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      check('T3: command_overuse = 1', r.counts.command_overuse === 1, 1, r.counts.command_overuse);
      check('T3: errors.length = 1（二重計上なし）', r.errors.length === 1, 1, r.errors.length);
    }

    // ─── Test 4: 指示命令 欠落 ──────────────────────────────
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '県庁', toLabel: 'C県A保健所', label: '指示命令' }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      check('T4: command_missing = 1', r.counts.command_missing === 1, 1, r.counts.command_missing);
    }

    // ─── Test 5: ハブ取り違え（正規化）────────────────────────
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '地域災害医療コーディネーター', toLabel: 'DMAT', label: '連携協力' }],
        addEdges:    [{ fromLabel: '市町村保健センター', toLabel: 'DMAT', label: '連携協力', bidirectional: true }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      check('T5: hub_misassignment = 1（swap 正規化）', r.counts.hub_misassignment === 1, 1, r.counts.hub_misassignment);
    }

    // ─── Test 6: ハブ接続ラベル誤り ─────────────────────────
    {
      // DMAT↔コーディネーター を '連携協力' でなく '指示命令以外の別ラベル' で繋ぐ
      // 'その他' ラベルを使うことで command_overuse の二重カウントを回避
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '地域災害医療コーディネーター', toLabel: 'DMAT', label: '連携協力' }],
        addEdges:    [{ fromLabel: '地域災害医療コーディネーター', toLabel: 'DMAT', label: 'その他', bidirectional: true }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      check('T6: edge_label_error = 1', r.counts.edge_label_error === 1, 1, r.counts.edge_label_error);
      check('T6: hub_misassignment = 0（接続先は正しい）', r.counts.hub_misassignment === 0, 0, r.counts.hub_misassignment);
    }

    // ─── Test 7: 支援レイヤー違反（第2段階スキップ確認）────────
    {
      const learner = buildLearner({
        addEdges: [{ fromLabel: '地域災害医療コーディネーター', toLabel: '避難所', label: '支援', bidirectional: false }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      check('T7: support_layer_violation = 1', r.counts.support_layer_violation === 1, 1, r.counts.support_layer_violation);
      check('T7: support_overuse = 0（第2段階スキップ）', r.counts.support_overuse === 0, 0, r.counts.support_overuse);
    }

    // ─── Test 8: 支援 欠落・過剰 ────────────────────────────
    {
      // DMAT→医療機関 を除去 → support_missing
      // JMAT→医療機関 を追加（JMAT は L3 だが理想にない） → support_overuse
      const learner = buildLearner({
        removeEdges: [{ fromLabel: 'DMAT', toLabel: '医療機関', label: '支援' }],
        addEdges:    [{ fromLabel: 'JMAT', toLabel: '医療機関', label: '支援', bidirectional: false }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      check('T8: support_missing = 1', r.counts.support_missing === 1, 1, r.counts.support_missing);
      check('T8: support_overuse = 1', r.counts.support_overuse === 1, 1, r.counts.support_overuse);
    }

    // ─── Test 9: 情報伝達 は無視 ────────────────────────────
    {
      // 情報伝達エッジを追加・既存を除去しても counts 不変
      const learnerAdd = buildLearner({
        addEdges: [
          { fromLabel: 'DMAT', toLabel: 'C県A保健所', label: '情報伝達', bidirectional: false },
          { fromLabel: 'JMAT', toLabel: '避難所',    label: '情報伝達', bidirectional: false },
        ],
      });
      const learnerRemove = buildLearner({
        removeEdges: [
          { fromLabel: 'C県A保健所', toLabel: '県庁',       label: '情報伝達' },
          { fromLabel: 'DHEAT',      toLabel: 'C県A保健所', label: '情報伝達' },
        ],
      });
      const rAdd    = gradeAcuteMap(learnerAdd,    IDEAL_NORM);
      const rRemove = gradeAcuteMap(learnerRemove, IDEAL_NORM);

      const addTotal    = Object.values(rAdd.counts).reduce((s, v) => s + v, 0);
      const removeTotal = Object.values(rRemove.counts).reduce((s, v) => s + v, 0);
      check('T9: 情報伝達追加で counts 不変', addTotal === 0, 0, addTotal);
      check('T9: 情報伝達削除で counts 不変', removeTotal === 0, 0, removeTotal);
    }

    // ─── Test 10: ラベル重複防御 ─────────────────────────────
    {
      const rawDup = {
        nodes: [
          { id: 'n1', label: 'DMAT', layerId: 3 },
          { id: 'n2', label: 'DMAT', layerId: 3 }, // 重複
        ],
        edges: [],
      };
      let threw = false;
      try { normalizeMap(rawDup); } catch (err) { threw = true; }
      check('T10: ラベル重複で例外スロー', threw, true, threw);
    }

    // ─── Test 11: 理想ハブペア上の指示命令（判定管轄・本修正の核心）──
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: 'C県A保健所', toLabel: '市町村保健センター', label: '連携協力' }],
        addEdges:    [{ fromLabel: 'C県A保健所', toLabel: '市町村保健センター', label: '指示命令', bidirectional: false }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      check('T11: edge_label_error = 1', r.counts.edge_label_error === 1, 1, r.counts.edge_label_error);
      check('T11: command_overuse = 0', r.counts.command_overuse === 0, 0, r.counts.command_overuse);
      check('T11: hub_misassignment = 0', r.counts.hub_misassignment === 0, 0, r.counts.hub_misassignment);
      check('T11: errors.length = 1', r.errors.length === 1, 1, r.errors.length);
    }

    // ─── Test 12: 理想指揮ペア上の連携協力 ───────────────────
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: 'C県A保健所', toLabel: 'DHEAT', label: '指示命令' }],
        addEdges:    [{ fromLabel: 'C県A保健所', toLabel: 'DHEAT', label: '連携協力', bidirectional: true }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      check('T12: command_missing = 1', r.counts.command_missing === 1, 1, r.counts.command_missing);
      check('T12: edge_label_error = 0', r.counts.edge_label_error === 0, 0, r.counts.edge_label_error);
      check('T12: hub_misassignment = 0', r.counts.hub_misassignment === 0, 0, r.counts.hub_misassignment);
      check('T12: errors.length = 1', r.errors.length === 1, 1, r.errors.length);
    }

    // ─── Test 13: 理想ハブペア上の情報伝達 ───────────────────
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '地域災害医療コーディネーター', toLabel: 'DMAT', label: '連携協力' }],
        addEdges:    [{ fromLabel: '地域災害医療コーディネーター', toLabel: 'DMAT', label: '情報伝達', bidirectional: false }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      const labelErr = r.errors.find(e => e.category === 'edge_label_error');
      check('T13: edge_label_error = 1', r.counts.edge_label_error === 1, 1, r.counts.edge_label_error);
      check('T13: detail.gotLabel = 情報伝達', labelErr?.detail.gotLabel === '情報伝達', '情報伝達', labelErr?.detail.gotLabel);
      check('T13: hub_misassignment = 0', r.counts.hub_misassignment === 0, 0, r.counts.hub_misassignment);
      check('T13: errors.length = 1', r.errors.length === 1, 1, r.errors.length);
    }

    // ─── Test 14: 指揮方向の反転（相補的2件判定の仕様固定）────
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: 'C県A保健所', toLabel: 'DHEAT', label: '指示命令' }],
        addEdges:    [{ fromLabel: 'DHEAT', toLabel: 'C県A保健所', label: '指示命令', bidirectional: false }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      check('T14: command_overuse = 1', r.counts.command_overuse === 1, 1, r.counts.command_overuse);
      check('T14: command_missing = 1', r.counts.command_missing === 1, 1, r.counts.command_missing);
      check('T14: errors.length = 2', r.errors.length === 2, 2, r.errors.length);
    }

    // ─── Test 15: 理想外ペアの純粋な指示命令過剰 ─────────────
    {
      const learner = buildLearner({
        addEdges: [{ fromLabel: 'DHEAT', toLabel: 'DMAT', label: '指示命令', bidirectional: false }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      check('T15: command_overuse = 1', r.counts.command_overuse === 1, 1, r.counts.command_overuse);
      check('T15: errors.length = 1', r.errors.length === 1, 1, r.errors.length);
    }

    // ─── Test 16: 非ハブ間連携協力（軸4・lateral） ────────────
    {
      const learner = buildLearner({
        addEdges: [{ fromLabel: 'DMAT', toLabel: 'JMAT', label: '連携協力', bidirectional: true }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'coordination_path_error');
      check('T16: coordination_path_error = 1', r.counts.coordination_path_error === 1, 1, r.counts.coordination_path_error);
      check('T16: subtype = lateral_coordination', err?.detail.subtype === 'lateral_coordination', 'lateral_coordination', err?.detail.subtype);
      check('T16: errors.length = 1（他軸に流れない）', r.errors.length === 1, 1, r.errors.length);
    }

    // ─── Test 17: DHEAT–L3 連携協力（軸4・DHEAT独立ハブ化誤り）──
    {
      const learner = buildLearner({
        addEdges: [{ fromLabel: 'DMAT', toLabel: 'DHEAT', label: '連携協力', bidirectional: true }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'coordination_path_error');
      check('T17: coordination_path_error = 1', r.counts.coordination_path_error === 1, 1, r.counts.coordination_path_error);
      check('T17: subtype = command_support_as_hub', err?.detail.subtype === 'command_support_as_hub', 'command_support_as_hub', err?.detail.subtype);
      check('T17: hub_misassignment = 0', r.counts.hub_misassignment === 0, 0, r.counts.hub_misassignment);
    }

    // ─── Test 18: 理想支援ペア上の連携協力（J4除外）──────────
    {
      // DMAT→避難所 の支援を除去し、代わりに連携協力で結ぶ。
      // 軸3の support_missing のみ立ち、軸4では計上しない（二重計上禁止 spec §3.7.6）。
      const learner = buildLearner({
        removeEdges: [{ fromLabel: 'DMAT', toLabel: '避難所', label: '支援' }],
        addEdges:    [{ fromLabel: 'DMAT', toLabel: '避難所', label: '連携協力', bidirectional: true }],
      });
      const r = gradeAcuteMap(learner, IDEAL_NORM);
      check('T18: support_missing = 1', r.counts.support_missing === 1, 1, r.counts.support_missing);
      check('T18: coordination_path_error = 0（J4）', r.counts.coordination_path_error === 0, 0, r.counts.coordination_path_error);
      check('T18: errors.length = 1', r.errors.length === 1, 1, r.errors.length);
    }

    // ─── まとめ ──────────────────────────────────────────────
    console.log(`[scoring.js] テスト完了: ${passed} passed, ${failed} failed`);
    return { passed, failed };
  }

  // ブラウザ向けエクスポート（spec §6）
  if (typeof window !== 'undefined') {
    window.__SCORING_TEST__ = runScoringTests;
  }

  // Node で直接実行された場合は自動テスト
  if (typeof module !== 'undefined' && require && require.main === module) {
    runScoringTests();
  }

})();
