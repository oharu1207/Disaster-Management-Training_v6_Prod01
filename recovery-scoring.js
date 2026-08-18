/**
 * recovery-scoring.js - 復旧期マップ採点エンジン（原則参照方式）
 * 仕様: addendum_B_recovery_scoring_spec.md
 * スコープ: 純粋ロジック。app.js / DOM / localStorage に依存しない。
 *
 * 急性期エンジン scoring.js とは完全に独立（凍結対象。scoring.js は一切参照・変更しない）。
 * pairKey / normalizeMap 相当のヘルパはこのファイル内に複製する（意図的な重複。§B0.2）。
 *
 * 正答参照（差分）方式ではなく、急性期と同じ「正答集合＋原則規則」のハイブリッド
 * （原則参照方式）。正答集合（IDEAL_*_R）は理想JSONからの動的導出を禁止し、明示宣言する
 * （§B0.3）。理想JSONとの整合性は auditRecoveryIdealConsistency() で起動時監査する。
 *
 * 公開窓口: window.__ICS_RECOVERY_SCORING__ = {
 *   normalizeRecoveryMap, gradeRecoveryMap, gradeRecoveryLayerPhase, gradeRecoveryEdgePhase,
 *   auditRecoveryIdealConsistency, version
 * }
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // 版識別子
  // ═══════════════════════════════════════════════════════════

  const RECOVERY_SCORING_RULE_VERSION = 'recovery-grade-v1';

  // ═══════════════════════════════════════════════════════════
  // ローカルヘルパ（scoring.js から意図的に複製。共通モジュール化しない：§B0.2）
  // ═══════════════════════════════════════════════════════════

  const ICS_PURE          = 'ics_pure';
  const DOMAIN_INTEGRATED = 'domain_integrated';

  // 無向ペアキー（辞書順ソート + 区切り文字）
  function pairKey(a, b) { return a <= b ? `${a}|||${b}` : `${b}|||${a}`; }

  /**
   * rawMap { nodes, edges, mapVersion? } を label 世界へ変換する。
   * 不正な from/to（ノード一覧に存在しない id）を持つエッジは捨て、件数のみ
   * unresolvedEdgeCount に記録する（§B6.1 手順0：どの軸にも流さない。例外を投げない）。
   * @throws {Error} ラベル重複時（既存 scoring.js normalizeMap と同じ設計方針：§B8.4）
   * @returns {{ nodes: {label,layerId}[], edges: {fromLabel,toLabel,label,bidirectional}[],
   *             unresolvedEdgeCount: number, mapVersion: string|null }}
   */
  function normalizeRecoveryMap(rawMap) {
    if (!rawMap || !Array.isArray(rawMap.nodes) || !Array.isArray(rawMap.edges)) {
      throw new Error('normalizeRecoveryMap: nodes/edges must be arrays');
    }
    const { nodes, edges } = rawMap;

    const seen = new Set();
    for (const n of nodes) {
      if (seen.has(n.label)) throw new Error(`Duplicate node label: "${n.label}"`);
      seen.add(n.label);
    }

    const idToLabel = new Map();
    for (const n of nodes) idToLabel.set(n.id, n.label);

    const normNodes = nodes.map(n => ({ label: n.label, layerId: n.layerId != null ? n.layerId : null }));

    const normEdges = [];
    let unresolvedEdgeCount = 0;
    for (const e of edges) {
      const fromLabel = idToLabel.get(e.from);
      const toLabel   = idToLabel.get(e.to);
      if (fromLabel === undefined || toLabel === undefined) {
        unresolvedEdgeCount++;
        continue;
      }
      normEdges.push({ fromLabel, toLabel, label: e.label, bidirectional: !!e.bidirectional });
    }

    return {
      nodes: normNodes,
      edges: normEdges,
      unresolvedEdgeCount,
      mapVersion: rawMap.mapVersion != null ? rawMap.mapVersion : null,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 正答集合の宣言（addendum B §B1。理想JSONからの動的導出は禁止：§B0.3）
  // ═══════════════════════════════════════════════════════════

  // 軸0・軸0L：ノード集合とレイヤー（計19ノード：L1:2 / L2:3 / L3:9 / L4:5）
  const IDEAL_NODE_LAYERS_R = {
    // L1 指揮層
    '県庁': 1, 'C県A保健所': 1,
    // L2 調整層
    '地域災害医療コーディネーター': 2, '市町村保健センター': 2, '地域包括支援センター': 2,
    // L3 実働層
    'JRAT': 3, 'DWAT': 3, 'DCAT': 3, '歯科医師会': 3, '医師会': 3, 'W民間団体': 3,
    '介護支援専門員協会': 3, '地域支え合いセンター': 3, '社会福祉士会': 3,
    // L4 被支援者
    '避難所': 4, '医療機関': 4, '福祉避難所': 4, '在宅避難者': 4, '仮設住宅': 4,
  };
  const BENEFICIARIES_R = new Set(['避難所', '医療機関', '福祉避難所', '在宅避難者', '仮設住宅']);

  // 軸1：指揮系統（有向 from|to、1本。急性期の C県A保健所|DHEAT は DHEAT 撤退により不在）
  const IDEAL_COMMAND_EDGES_R = new Set(['県庁|C県A保健所']);
  // 理想指揮ペア（無向）。このペア上のエッジはラベル不問で軸1管轄（J2-R）
  const IDEAL_COMMAND_PAIRS_R = new Set([pairKey('県庁', 'C県A保健所')]);

  // 軸2：ハブ接続。急性期の3ハブに地域包括支援センターを追加した4ハブ
  const HUBS_R = new Set([
    'C県A保健所', '地域災害医療コーディネーター', '市町村保健センター', '地域包括支援センター',
  ]);

  // 理想ハブペア（無向、重複排除済み。計14ペア）
  const IDEAL_HUB_PAIRS_RAW_R = [
    // C県A保健所 から
    ['C県A保健所', '地域災害医療コーディネーター'],
    ['C県A保健所', '歯科医師会'],
    ['C県A保健所', '医師会'],
    ['C県A保健所', 'W民間団体'],
    ['C県A保健所', '地域包括支援センター'],
    ['C県A保健所', '市町村保健センター'],
    // 地域災害医療コーディネーター から
    ['地域災害医療コーディネーター', '医師会'],
    // 市町村保健センター から
    ['市町村保健センター', 'JRAT'],
    ['市町村保健センター', 'DWAT'],
    ['市町村保健センター', 'DCAT'],
    ['市町村保健センター', '地域包括支援センター'],
    ['市町村保健センター', '地域支え合いセンター'],
    // 地域包括支援センター から
    ['地域包括支援センター', '社会福祉士会'],
    ['地域包括支援センター', '介護支援専門員協会'],
  ];
  // pairKey → [hub, org] マップ（O(1) 照合用。順序は宣言配列のまま：detail.hub/org に使う）
  const IDEAL_HUB_MAP_R = new Map();
  for (const [a, b] of IDEAL_HUB_PAIRS_RAW_R) IDEAL_HUB_MAP_R.set(pairKey(a, b), [a, b]);

  // 軸3：支援（有向 from|to。計16本のうち4本がL2起点：市町村保健センター発3本、地域包括支援センター発1本）
  const IDEAL_SUPPORT_EDGES_R = new Set([
    '医師会|医療機関',
    '医師会|避難所', '歯科医師会|避難所', 'W民間団体|避難所',
    'DWAT|避難所', 'DCAT|避難所', 'JRAT|避難所',
    'DWAT|福祉避難所', '地域包括支援センター|福祉避難所',
    'JRAT|仮設住宅', '地域支え合いセンター|仮設住宅',
    '介護支援専門員協会|在宅避難者', '地域支え合いセンター|在宅避難者',
    '市町村保健センター|避難所', '市町村保健センター|仮設住宅', '市町村保健センター|在宅避難者',
  ]);

  // J4用。IDEAL_SUPPORT_EDGES_R から機械的に導出する唯一の派生定数（独立の真実を持たない。§B2.3）
  const IDEAL_SUPPORT_PAIRS_UNDIRECTED_R = new Set(
    [...IDEAL_SUPPORT_EDGES_R].map(k => { const [f, t] = k.split('|'); return pairKey(f, t); })
  );

  // §B5.2 位相残留フラグ用。急性期の正解構造をそのまま持ち込んだ状態を検出する（誤りカテゴリではない）
  const CARRYOVER_LAYER_R = { '地域包括支援センター': 3 }; // 急性期のL3のまま置く
  const CARRYOVER_EDGES_R = new Set([
    '歯科医師会|医療機関',         // 急性期は正解、復旧期は不要
    '地域包括支援センター|避難所', // 復旧期は福祉避難所へ
  ]);

  // §B5.1 rev B-2：welfare_hub_allocation 判定用（type:"swap" の下位分類）。
  // 「福祉系の周辺組織」と「福祉ハブ2つ」の集合。両方に該当するスワップにのみ付与する。
  const WELFARE_ORGS_R = new Set(['社会福祉士会', '介護支援専門員協会', '地域支え合いセンター', 'DWAT', 'DCAT', 'JRAT']);
  const WELFARE_HUBS_R = new Set(['市町村保健センター', '地域包括支援センター']);

  // ═══════════════════════════════════════════════════════════
  // カテゴリ → principleGroup（§B3。急性期と共通の9種＋復旧期追加の2種＝計11種。新設禁止）
  // ═══════════════════════════════════════════════════════════

  const CATEGORY_GROUP_R = {
    layer_mismatch:          ICS_PURE,
    command_overuse:         ICS_PURE,
    command_missing:         ICS_PURE,
    edge_label_error:        ICS_PURE,
    support_layer_violation: ICS_PURE,
    hub_misassignment:       DOMAIN_INTEGRATED,
    support_missing:         DOMAIN_INTEGRATED,
    support_overuse:         DOMAIN_INTEGRATED,
    coordination_path_error: DOMAIN_INTEGRATED,
    node_missing:            DOMAIN_INTEGRATED,
    node_extra:              DOMAIN_INTEGRATED,
  };

  const AXIS_RANK = { 0: 0, '0L': 1, 1: 2, 2: 3, 3: 4, 4: 5 };
  const AXIS_KEY  = { 0: 'axis0', '0L': 'axis0L', 1: 'axis1', 2: 'axis2', 3: 'axis3', 4: 'axis4' };

  function makeError(category, axis, detail, flags) {
    return {
      category,
      principleGroup: CATEGORY_GROUP_R[category],
      axis,
      detail,
      flags: flags || { phaseCarryover: false },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 軸0・軸0L：組織集合とレイヤー配置
  // ═══════════════════════════════════════════════════════════

  function computeNodeAxes(learnerNorm) {
    const errors = [];
    const idealLabels   = new Set(Object.keys(IDEAL_NODE_LAYERS_R));
    const learnerLabels = new Set(learnerNorm.nodes.map(n => n.label));

    // 軸0L：レイヤー不一致（両者に存在するラベルのみ対象。R1）
    for (const n of learnerNorm.nodes) {
      if (!idealLabels.has(n.label)) continue;
      const expected = IDEAL_NODE_LAYERS_R[n.label];
      const got = n.layerId;
      if (got !== expected) {
        const carryover = CARRYOVER_LAYER_R[n.label] != null && got === CARRYOVER_LAYER_R[n.label];
        errors.push(makeError('layer_mismatch', '0L', { label: n.label, expected, got },
          { phaseCarryover: carryover }));
      }
    }

    // 軸0：ノード不足・余剰（R2）。node_missing に接続すべきエッジは当然そのエッジ軸でも
    // 欠落として計上される（二重計上ではなく異なる軸の別事象として扱う：R2 注記）
    for (const label of idealLabels) {
      if (!learnerLabels.has(label)) {
        errors.push(makeError('node_missing', 0, { label, expectedLayerId: IDEAL_NODE_LAYERS_R[label] }));
      }
    }
    for (const n of learnerNorm.nodes) {
      if (!idealLabels.has(n.label)) {
        errors.push(makeError('node_extra', 0, { label: n.label, got: n.layerId }));
      }
    }

    return errors;
  }

  // ═══════════════════════════════════════════════════════════
  // 軸1：指揮系統
  // ═══════════════════════════════════════════════════════════

  function computeAxis1(learnerNorm) {
    const errors = [];

    const learnerCommandSet = new Set();
    for (const e of learnerNorm.edges) {
      if (e.label === '指示命令') learnerCommandSet.add(`${e.fromLabel}|${e.toLabel}`);
    }

    // 欠落
    for (const key of IDEAL_COMMAND_EDGES_R) {
      if (!learnerCommandSet.has(key)) {
        const [f, t] = key.split('|');
        errors.push(makeError('command_missing', 1, { fromLabel: f, toLabel: t }));
      }
    }

    // J1例外判定用：学習者の連携協力（無向ペアキー）
    const learnerCoopPairs = new Set();
    for (const e of learnerNorm.edges) {
      if (e.label === '連携協力') learnerCoopPairs.add(pairKey(e.fromLabel, e.toLabel));
    }

    // 過剰（理想指揮ペア外に引かれた指示命令）
    for (const key of learnerCommandSet) {
      if (IDEAL_COMMAND_EDGES_R.has(key)) continue;
      const [f, t] = key.split('|');
      const pk = pairKey(f, t);
      // J1：理想ハブペア上の指示命令は軸2管轄（edge_label_error）。
      //     ただし正しい連携協力が併存する場合は純粋な過剰として軸1で数える（J1例外）。
      if (IDEAL_HUB_MAP_R.has(pk) && !learnerCoopPairs.has(pk)) continue;
      errors.push(makeError('command_overuse', 1, { fromLabel: f, toLabel: t }));
    }

    return errors;
  }

  // ═══════════════════════════════════════════════════════════
  // 軸2：ハブ接続（rev B-2：急性期 scoring.js の gradeAxis2() と同一アルゴリズム。
  // 定数のみ復旧期用（HUBS_R／IDEAL_HUB_MAP_R）に差し替える。scoring.js からは
  // import・共有化せず、本ファイル内に複製する：§B0.2）
  // ═══════════════════════════════════════════════════════════

  // ハブペアから周辺ノード（非ハブ端）を返す。両端ハブまたは両端非ハブなら null。
  // （scoring.js の getPeripheral と同一ロジックの複製）
  function getPeripheralR(a, b) {
    const aHub = HUBS_R.has(a), bHub = HUBS_R.has(b);
    if (aHub && !bHub) return b;
    if (bHub && !aHub) return a;
    return null;
  }

  function computeAxis2(learnerNorm) {
    const errors = [];

    // J1例外判定用：学習者の連携協力（無向ペアキー）。軸1と独立に再計算する
    // （scoring.js の gradeAxis2 と同じ設計。軸1の集合を共有しない）。
    const learnerCoopPairsA2 = new Set();
    for (const e of learnerNorm.edges) {
      if (e.label === '連携協力') learnerCoopPairsA2.add(pairKey(e.fromLabel, e.toLabel));
    }

    // R4-1：対象エッジの抽出（管轄規則 J1〜J3）
    const learnerHubEdges = [];
    for (const e of learnerNorm.edges) {
      if (e.label === '支援') continue;                                    // 支援は軸3管轄
      const key = pairKey(e.fromLabel, e.toLabel);
      if (IDEAL_COMMAND_PAIRS_R.has(key)) continue;                        // J2：理想指揮ペアは軸1管轄
      if (!HUBS_R.has(e.fromLabel) && !HUBS_R.has(e.toLabel)) continue;    // 少なくとも一端がハブ
      if (e.label === '情報伝達' && !IDEAL_HUB_MAP_R.has(key)) continue;   // J3：ハブペア外の情報伝達は対象外
      if (e.label === '指示命令') {
        if (!IDEAL_HUB_MAP_R.has(key)) continue;                           // J1：ハブペア外の指示命令は軸1管轄
        if (learnerCoopPairsA2.has(key)) continue;                         // J1例外：連携協力併存 → 軸1管轄
      }
      learnerHubEdges.push({ fromLabel: e.fromLabel, toLabel: e.toLabel, label: e.label, key });
    }

    // R4-2：第1パス（理想ペアと一致する学習者エッジを照合し、ラベルチェック）。
    // 理想ペアは1回だけ消費する。同一ペア上に複数の学習者エッジがあっても「無罪」にはせず、
    // 未照合分は第2パス（スワップ or 過剰）へ送る。
    const usedIdealPairs   = new Set();
    const learnerAccounted = new Set();

    for (let i = 0; i < learnerHubEdges.length; i++) {
      const le = learnerHubEdges[i];
      if (IDEAL_HUB_MAP_R.has(le.key) && !usedIdealPairs.has(le.key)) {
        usedIdealPairs.add(le.key);
        learnerAccounted.add(i);
        if (le.label !== '連携協力') {
          errors.push(makeError('edge_label_error', 2, {
            fromLabel: le.fromLabel, toLabel: le.toLabel,
            expectedLabel: '連携協力', gotLabel: le.label,
          }));
        }
      }
    }

    // 未消費の理想ペア = missing候補
    const missingPairKeys = [...IDEAL_HUB_MAP_R.keys()].filter(k => !usedIdealPairs.has(k));

    // peripheral → missing ペアキー配列（スワップ検出用）
    const peripheralToMissing = new Map();
    for (const k of missingPairKeys) {
      const [a, b] = IDEAL_HUB_MAP_R.get(k);
      const peripheral = getPeripheralR(a, b);
      if (peripheral) {
        if (!peripheralToMissing.has(peripheral)) peripheralToMissing.set(peripheral, []);
        peripheralToMissing.get(peripheral).push(k);
      }
    }

    const consumedMissing = new Set();

    // R4-3：第2パス（未照合の学習者エッジをスワップ or 過剰として処理）
    for (let i = 0; i < learnerHubEdges.length; i++) {
      if (learnerAccounted.has(i)) continue;
      const le = learnerHubEdges[i];
      const peripheral = getPeripheralR(le.fromLabel, le.toLabel);

      if (peripheral && peripheralToMissing.has(peripheral)) {
        const candidates = peripheralToMissing.get(peripheral).filter(k => !consumedMissing.has(k));
        if (candidates.length > 0) {
          // スワップ確定：missing 1件を消費し、1誤りに正規化
          consumedMissing.add(candidates[0]);
          const [a, b] = IDEAL_HUB_MAP_R.get(candidates[0]);
          const correctHub = HUBS_R.has(a) ? a : b;
          const wrongHub   = HUBS_R.has(le.fromLabel) ? le.fromLabel : le.toLabel;
          // §B5.1 rev B-2：福祉ハブ間（市町村保健センター⇔地域包括支援センター）の
          // 取り違えで、かつ周辺組織が福祉系のときのみ welfareHubAllocation を付与する。
          const welfareHubAllocation =
            WELFARE_HUBS_R.has(correctHub) && WELFARE_HUBS_R.has(wrongHub) && WELFARE_ORGS_R.has(peripheral);
          errors.push(makeError('hub_misassignment', 2, {
            type: 'swap', peripheral, correctHub, wrongHub, welfareHubAllocation,
          }));
          continue;
        }
      }
      // スワップ非該当 → 過剰（理想外のハブ接続。§B5.1 rev B-2により誤りとして計上する）
      errors.push(makeError('hub_misassignment', 2, {
        type: 'overuse', fromLabel: le.fromLabel, toLabel: le.toLabel,
      }));
    }

    // R4-4：残存 missing（スワップで消費されなかったもの。ハブ同士のペアは peripheral が
    // null のため常にここに残る：R4-5）
    for (const k of missingPairKeys) {
      if (!consumedMissing.has(k)) {
        const [a, b] = IDEAL_HUB_MAP_R.get(k);
        errors.push(makeError('hub_misassignment', 2, { type: 'missing', fromLabel: a, toLabel: b }));
      }
    }

    return errors;
  }

  // ═══════════════════════════════════════════════════════════
  // 軸3：支援
  // ═══════════════════════════════════════════════════════════

  function computeAxis3(learnerNorm) {
    const errors = [];
    const learnerValidSupport = new Set();

    for (const e of learnerNorm.edges) {
      if (e.label !== '支援') continue;

      // 第1段階a：起点レイヤーは L2 または L3（急性期はL3のみ。復旧期固有規則）
      const fromLayerId = IDEAL_NODE_LAYERS_R[e.fromLabel];
      if (fromLayerId !== 2 && fromLayerId !== 3) {
        errors.push(makeError('support_layer_violation', 3, {
          fromLabel: e.fromLabel, toLabel: e.toLabel,
          fromLayerId: fromLayerId != null ? fromLayerId : null, subtype: 'origin_layer',
        }));
        continue; // 判定順序：layer_violation 確定時は overuse を計上しない（1エッジ最大1誤り）
      }

      // 第1段階b：接続先は被支援者であること
      if (!BENEFICIARIES_R.has(e.toLabel)) {
        errors.push(makeError('support_layer_violation', 3, {
          fromLabel: e.fromLabel, toLabel: e.toLabel, subtype: 'target_not_beneficiary',
        }));
        continue;
      }

      // 第2段階：正誤照合用に収集
      learnerValidSupport.add(`${e.fromLabel}|${e.toLabel}`);
    }

    // 欠落
    for (const key of IDEAL_SUPPORT_EDGES_R) {
      if (!learnerValidSupport.has(key)) {
        const [f, t] = key.split('|');
        errors.push(makeError('support_missing', 3, { fromLabel: f, toLabel: t }));
      }
    }

    // 過剰（急性期正解構造の残留は phaseCarryover フラグで区別。誤りカテゴリ自体は変えない）
    for (const key of learnerValidSupport) {
      if (!IDEAL_SUPPORT_EDGES_R.has(key)) {
        const [f, t] = key.split('|');
        errors.push(makeError('support_overuse', 3, { fromLabel: f, toLabel: t },
          { phaseCarryover: CARRYOVER_EDGES_R.has(key) }));
      }
    }

    return errors;
  }

  // ═══════════════════════════════════════════════════════════
  // 軸4：調整経路（両端ともハブでない連携協力）
  // ═══════════════════════════════════════════════════════════

  function computeAxis4(learnerNorm) {
    const errors = [];
    for (const e of learnerNorm.edges) {
      if (e.label !== '連携協力') continue;
      if (HUBS_R.has(e.fromLabel) || HUBS_R.has(e.toLabel)) continue; // 片端でもハブなら軸2管轄
      const pk = pairKey(e.fromLabel, e.toLabel);
      if (IDEAL_COMMAND_PAIRS_R.has(pk)) continue;              // J2（防御的。県庁側は非ハブだが念のため）
      if (IDEAL_SUPPORT_PAIRS_UNDIRECTED_R.has(pk)) continue;   // J4：理想支援ペア上は軸3で捕捉済み
      const subtype = (e.fromLabel === '県庁' || e.toLabel === '県庁')
        ? 'command_layer_as_hub'
        : 'lateral_coordination';
      errors.push(makeError('coordination_path_error', 4, { fromLabel: e.fromLabel, toLabel: e.toLabel, subtype }));
    }
    return errors;
  }

  // ═══════════════════════════════════════════════════════════
  // 集計・出力形式（§B8.2）
  // ═══════════════════════════════════════════════════════════

  function detailSortKey(detail) {
    const primary   = detail.label || detail.fromLabel || detail.peripheral || '';
    const secondary = detail.toLabel || detail.wrongHub || detail.expectedLayerId || '';
    return `${primary}|||${secondary}`;
  }

  // errors は決定的な順序で返す：軸 → カテゴリ → ラベル辞書順（配列の入力順に依存しない：§B8.3）
  function sortErrors(errors) {
    return errors.slice().sort((a, b) => {
      const axisDiff = AXIS_RANK[a.axis] - AXIS_RANK[b.axis];
      if (axisDiff !== 0) return axisDiff;
      if (a.category !== b.category) return a.category < b.category ? -1 : 1;
      const ka = detailSortKey(a.detail), kb = detailSortKey(b.detail);
      return ka < kb ? -1 : (ka > kb ? 1 : 0);
    });
  }

  function buildResult(rawErrors, learnerNorm, idealNorm) {
    const errors = sortErrors(rawErrors);

    const counts = {};
    for (const cat of Object.keys(CATEGORY_GROUP_R)) counts[cat] = 0;
    for (const e of errors) counts[e.category]++;

    const axisCounts = { axis0: 0, axis0L: 0, axis1: 0, axis2: 0, axis3: 0, axis4: 0 };
    for (const e of errors) axisCounts[AXIS_KEY[e.axis]]++;

    const groupCounts = { ics_pure: 0, domain_integrated: 0 };
    for (const e of errors) groupCounts[e.principleGroup]++;

    const subtypeCounts = {
      welfare_hub_allocation: 0, lateral_coordination: 0, command_layer_as_hub: 0,
      origin_layer: 0, target_not_beneficiary: 0,
    };
    for (const e of errors) {
      const st = e.detail && e.detail.subtype;
      if (st && Object.prototype.hasOwnProperty.call(subtypeCounts, st)) subtypeCounts[st]++;
      // hub_misassignment（type:"swap"）は subtype 文字列ではなく detail.welfareHubAllocation
      // という真偽値で福祉ハブ振り分けを表す（rev B-2 §B5.1）。ここで subtypeCounts の
      // welfare_hub_allocation バケットへ合流させる。
      if (e.category === 'hub_misassignment' && e.detail && e.detail.type === 'swap' && e.detail.welfareHubAllocation === true) {
        subtypeCounts.welfare_hub_allocation++;
      }
    }

    const flagCounts = { phaseCarryover: 0 };
    for (const e of errors) if (e.flags && e.flags.phaseCarryover) flagCounts.phaseCarryover++;

    return {
      errors,
      counts,
      axisCounts,
      groupCounts,
      subtypeCounts,
      flagCounts,
      meta: {
        idealNodeCount: idealNorm.nodes.length,
        idealEdgeCount: idealNorm.edges.length,
        learnerNodeCount: learnerNorm.nodes.length,
        learnerEdgeCount: learnerNorm.edges.length,
        ruleVersion: RECOVERY_SCORING_RULE_VERSION,
        mapVersion: idealNorm.mapVersion != null ? idealNorm.mapVersion : null,
        unresolvedEdgeCount: learnerNorm.unresolvedEdgeCount || 0,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 公開関数（§B8.1）
  // 採点ロジックは正答集合の宣言定数のみを参照する（idealNorm は meta 報告にのみ使用）。
  // ═══════════════════════════════════════════════════════════

  function gradeRecoveryMap(learnerNorm, idealNorm) {
    const errors = []
      .concat(computeNodeAxes(learnerNorm))
      .concat(computeAxis1(learnerNorm))
      .concat(computeAxis2(learnerNorm))
      .concat(computeAxis3(learnerNorm))
      .concat(computeAxis4(learnerNorm));
    return buildResult(errors, learnerNorm, idealNorm);
  }

  // フェーズ15用：軸0・軸0L のみ
  function gradeRecoveryLayerPhase(learnerNorm, idealNorm) {
    return buildResult(computeNodeAxes(learnerNorm), learnerNorm, idealNorm);
  }

  // フェーズ16用：軸1〜4 のみ
  function gradeRecoveryEdgePhase(learnerNorm, idealNorm) {
    const errors = []
      .concat(computeAxis1(learnerNorm))
      .concat(computeAxis2(learnerNorm))
      .concat(computeAxis3(learnerNorm))
      .concat(computeAxis4(learnerNorm));
    return buildResult(errors, learnerNorm, idealNorm);
  }

  // ═══════════════════════════════════════════════════════════
  // 監査（§B7）：副作用なしの純粋関数。ログ記録は呼び出し側（app.js）の責務。
  // ═══════════════════════════════════════════════════════════

  /**
   * @param {ReturnType<normalizeRecoveryMap>} idealNorm
   * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
   */
  function auditRecoveryIdealConsistency(idealNorm) {
    const errors = [];
    const warnings = [];

    // A1：件数の期待値ずれ（警告のみ。ok は維持）
    if (idealNorm.nodes.length !== 19) {
      warnings.push(`ノード数が期待値19と異なります: ${idealNorm.nodes.length}`);
    }
    if (idealNorm.edges.length !== 32) {
      warnings.push(`エッジ数が期待値32と異なります: ${idealNorm.edges.length}`);
    }

    // A2：ノードラベル集合（IDEAL_NODE_LAYERS_R のキー集合との一致）
    const idealLabels    = new Set(idealNorm.nodes.map(n => n.label));
    const declaredLabels = new Set(Object.keys(IDEAL_NODE_LAYERS_R));
    for (const l of declaredLabels) if (!idealLabels.has(l)) errors.push(`ノードラベル: 宣言にあるがJSONに無い → ${l}`);
    for (const l of idealLabels)    if (!declaredLabels.has(l)) errors.push(`ノードラベル: JSONにあるが宣言に無い → ${l}`);

    // A3：各ノードの layerId が宣言と一致
    for (const n of idealNorm.nodes) {
      if (declaredLabels.has(n.label) && IDEAL_NODE_LAYERS_R[n.label] !== n.layerId) {
        errors.push(`layerId不一致: ${n.label} 宣言=${IDEAL_NODE_LAYERS_R[n.label]} JSON=${n.layerId}`);
      }
    }

    // A4：指示命令エッジ集合
    const jsonCommand = new Set();
    for (const e of idealNorm.edges) if (e.label === '指示命令') jsonCommand.add(`${e.fromLabel}|${e.toLabel}`);
    for (const k of jsonCommand)          if (!IDEAL_COMMAND_EDGES_R.has(k)) errors.push(`指示命令: 宣言に無い → ${k}`);
    for (const k of IDEAL_COMMAND_EDGES_R) if (!jsonCommand.has(k))          errors.push(`指示命令: JSONに無い → ${k}`);

    // A5：連携協力の無向ペア集合
    const jsonHub = new Set();
    for (const e of idealNorm.edges) if (e.label === '連携協力') jsonHub.add(pairKey(e.fromLabel, e.toLabel));
    for (const k of jsonHub)               if (!IDEAL_HUB_MAP_R.has(k)) errors.push(`ハブ接続: 宣言に無い → ${k}`);
    for (const k of IDEAL_HUB_MAP_R.keys()) if (!jsonHub.has(k))        errors.push(`ハブ接続: JSONに無い → ${k}`);

    // A6：支援エッジ集合
    const jsonSupport = new Set();
    for (const e of idealNorm.edges) if (e.label === '支援') jsonSupport.add(`${e.fromLabel}|${e.toLabel}`);
    for (const k of jsonSupport)           if (!IDEAL_SUPPORT_EDGES_R.has(k)) errors.push(`支援: 宣言に無い → ${k}`);
    for (const k of IDEAL_SUPPORT_EDGES_R) if (!jsonSupport.has(k))           errors.push(`支援: JSONに無い → ${k}`);

    // A7：ノードラベルの重複がない（normalizeRecoveryMap が既に例外化するため、ここに来た時点で保証済み。
    //      監査項目として明示するため冗長チェックは行わない）

    // A8：全エッジの端点がノードIDに解決できる（normalizeRecoveryMap が未解決を除外して数えているため、
    //      その件数が0であることを確認する）
    if (idealNorm.unresolvedEdgeCount > 0) {
      errors.push(`未解決エッジが${idealNorm.unresolvedEdgeCount}件あります（端点IDがノード一覧に無い）`);
    }

    // A9：理想マップの自己採点が0誤り（宣言定数と理想JSONの整合を一括保証。最重要検査）
    const selfResult = gradeRecoveryMap(idealNorm, idealNorm);
    if (selfResult.errors.length > 0) {
      errors.push(`理想マップの自己採点が0誤りではありません: ${selfResult.errors.length}件`);
    }

    // A10：情報伝達エッジは検査しない（J3-Rにより採点対象外。監査対象にも含めない）

    return { ok: errors.length === 0, errors, warnings };
  }

  // ═══════════════════════════════════════════════════════════
  // エクスポート
  // ═══════════════════════════════════════════════════════════

  const _exports = {
    normalizeRecoveryMap,
    gradeRecoveryMap,
    gradeRecoveryLayerPhase,
    gradeRecoveryEdgePhase,
    auditRecoveryIdealConsistency,
    version: RECOVERY_SCORING_RULE_VERSION,
  };

  if (typeof window !== 'undefined') {
    window.__ICS_RECOVERY_SCORING__ = _exports;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = _exports;
  }

  // ═══════════════════════════════════════════════════════════
  // テストハーネス（addendum B §B9 RT1〜RT36）
  // ブラウザ: window.__RECOVERY_SCORING_TEST__() を呼ぶ
  // Node:    node recovery-scoring.js で自動実行
  // ═══════════════════════════════════════════════════════════

  // 正解マップの raw 形式（ideal_map_recovery.json の recovery.nodes / recovery.edges を
  // そのまま抽出したもの。id を保持し、normalizeRecoveryMap の id→label 変換を実地に検証する）。
  const RAW_IDEAL_RECOVERY = {
    nodes: [
      { id: 'n-e5u03zv', label: '県庁', layerId: 1 },
      { id: 'n-1b51ttm', label: 'C県A保健所', layerId: 1 },
      { id: 'n-952758i', label: '地域災害医療コーディネーター', layerId: 2 },
      { id: 'n-2q8mbab', label: '避難所', layerId: 4 },
      { id: 'n-1wk7j82', label: '医療機関', layerId: 4 },
      { id: 'n-heiewrt', label: '市町村保健センター', layerId: 2 },
      { id: 'n-tid8usx', label: '地域包括支援センター', layerId: 2 },
      { id: 'n-t71pa8w', label: 'JRAT', layerId: 3 },
      { id: 'n-b52j592', label: 'DWAT', layerId: 3 },
      { id: 'n-6yp25ia', label: '歯科医師会', layerId: 3 },
      { id: 'n-fhgc1xc', label: '医師会', layerId: 3 },
      { id: 'n-uxp6llj', label: 'W民間団体', layerId: 3 },
      { id: 'n-vfhnw62', label: 'DCAT', layerId: 3 },
      { id: 'n-h018kmy', label: '福祉避難所', layerId: 4 },
      { id: 'n-kkuqhw1', label: '在宅避難者', layerId: 4 },
      { id: 'n-6zqseus', label: '仮設住宅', layerId: 4 },
      { id: 'n-dwcsgs9', label: '介護支援専門員協会', layerId: 3 },
      { id: 'n-jxpjmz9', label: '地域支え合いセンター', layerId: 3 },
      { id: 'n-emi9jdl', label: '社会福祉士会', layerId: 3 },
    ],
    edges: [
      { id: 'e-htp6udn', from: 'n-e5u03zv', to: 'n-1b51ttm', label: '指示命令', bidirectional: false },
      { id: 'e-5y92t8w', from: 'n-1b51ttm', to: 'n-e5u03zv', label: '情報伝達', bidirectional: false },
      { id: 'e-wkkod0r', from: 'n-1b51ttm', to: 'n-952758i', label: '連携協力', bidirectional: true },
      { id: 'e-dnixxh7', from: 'n-1b51ttm', to: 'n-6yp25ia', label: '連携協力', bidirectional: true },
      { id: 'e-cx7lb1z', from: 'n-1b51ttm', to: 'n-fhgc1xc', label: '連携協力', bidirectional: true },
      { id: 'e-psz7egg', from: 'n-fhgc1xc', to: 'n-1wk7j82', label: '支援', bidirectional: false },
      { id: 'e-y0eyds2', from: 'n-1b51ttm', to: 'n-uxp6llj', label: '連携協力', bidirectional: true },
      { id: 'e-ofsat7h', from: 'n-uxp6llj', to: 'n-2q8mbab', label: '支援', bidirectional: false },
      { id: 'e-tfscs8z', from: 'n-1b51ttm', to: 'n-tid8usx', label: '連携協力', bidirectional: true },
      { id: 'e-91rmbou', from: 'n-heiewrt', to: 'n-1b51ttm', label: '連携協力', bidirectional: true },
      { id: 'e-4az15f8', from: 'n-heiewrt', to: 'n-tid8usx', label: '連携協力', bidirectional: true },
      { id: 'e-nqpf451', from: 'n-tid8usx', to: 'n-emi9jdl', label: '連携協力', bidirectional: true },
      { id: 'e-a9kykrw', from: 'n-dwcsgs9', to: 'n-tid8usx', label: '連携協力', bidirectional: true },
      { id: 'e-d1ejtet', from: 'n-dwcsgs9', to: 'n-kkuqhw1', label: '支援', bidirectional: false },
      { id: 'e-m3zzifw', from: 'n-b52j592', to: 'n-h018kmy', label: '支援', bidirectional: false },
      { id: 'e-jt7fh3b', from: 'n-vfhnw62', to: 'n-2q8mbab', label: '支援', bidirectional: false },
      { id: 'e-w6bls9a', from: 'n-6yp25ia', to: 'n-2q8mbab', label: '支援', bidirectional: false },
      { id: 'e-rlovozn', from: 'n-t71pa8w', to: 'n-6zqseus', label: '支援', bidirectional: false },
      { id: 'e-s7pck3v', from: 'n-t71pa8w', to: 'n-2q8mbab', label: '支援', bidirectional: false },
      { id: 'e-6qljmif', from: 'n-jxpjmz9', to: 'n-6zqseus', label: '支援', bidirectional: false },
      { id: 'e-ulpk95h', from: 'n-jxpjmz9', to: 'n-kkuqhw1', label: '支援', bidirectional: false },
      { id: 'e-m7g4jrq', from: 'n-fhgc1xc', to: 'n-2q8mbab', label: '支援', bidirectional: false },
      { id: 'e-fxnq9wn', from: 'n-b52j592', to: 'n-2q8mbab', label: '支援', bidirectional: false },
      { id: 'e-uzly2mz', from: 'n-952758i', to: 'n-fhgc1xc', label: '連携協力', bidirectional: true },
      { id: 'e-ajvvnmp', from: 'n-heiewrt', to: 'n-t71pa8w', label: '連携協力', bidirectional: true },
      { id: 'e-5pnnmu5', from: 'n-heiewrt', to: 'n-b52j592', label: '連携協力', bidirectional: true },
      { id: 'e-76uctgl', from: 'n-heiewrt', to: 'n-vfhnw62', label: '連携協力', bidirectional: true },
      { id: 'e-5k31ade', from: 'n-heiewrt', to: 'n-2q8mbab', label: '支援', bidirectional: false },
      { id: 'e-watph5q', from: 'n-heiewrt', to: 'n-6zqseus', label: '支援', bidirectional: false },
      { id: 'e-yp2ixbt', from: 'n-heiewrt', to: 'n-kkuqhw1', label: '支援', bidirectional: false },
      { id: 'e-onwh6pk', from: 'n-tid8usx', to: 'n-h018kmy', label: '支援', bidirectional: false },
      { id: 'e-n9fy2qw', from: 'n-heiewrt', to: 'n-jxpjmz9', label: '連携協力', bidirectional: true },
    ],
    mapVersion: 'recovery-v1-19n32e',
  };

  const IDEAL_NORM = normalizeRecoveryMap(RAW_IDEAL_RECOVERY);

  // IDEAL_NORM をベースに nodes/edges を差分編集した learnerNorm を返す
  function buildLearner({ removeEdges = [], addEdges = [], changeNodes = [], removeNodes = [], addNodes = [] } = {}) {
    const removeEdgeKeys = new Set(removeEdges.map(e => `${e.fromLabel}|${e.toLabel}|${e.label}`));
    let edges = IDEAL_NORM.edges.filter(e => !removeEdgeKeys.has(`${e.fromLabel}|${e.toLabel}|${e.label}`));
    edges = edges.concat(addEdges);

    const removeNodeLabels = new Set(removeNodes);
    const labelChanges = new Map(changeNodes.map(c => [c.label, c]));
    let nodes = IDEAL_NORM.nodes
      .filter(n => !removeNodeLabels.has(n.label))
      .map(n => (labelChanges.has(n.label) ? Object.assign({}, n, labelChanges.get(n.label)) : n));
    nodes = nodes.concat(addNodes);

    return { nodes, edges, unresolvedEdgeCount: 0, mapVersion: IDEAL_NORM.mapVersion };
  }

  // 固定シード線形合同法（外部依存なしで再現可能な擬似乱数）
  function makeLcg(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function shuffle(arr, seed) {
    const rnd = makeLcg(seed);
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function runRecoveryScoringTests() {
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

    console.log('[recovery-scoring.js] テスト開始');

    // ─── 基本 ──────────────────────────────────────────────
    {
      const r = gradeRecoveryMap(IDEAL_NORM, IDEAL_NORM);
      check('RT1: 理想＝学習者 → 全カテゴリ0誤り', r.errors.length === 0, 0, r.errors.length);
    }

    {
      const baseline = gradeRecoveryMap(IDEAL_NORM, IDEAL_NORM);
      let allMatch = true;
      for (const seed of [1, 42, 12345, 999999]) {
        const shuffledRaw = {
          nodes: shuffle(RAW_IDEAL_RECOVERY.nodes, seed),
          edges: shuffle(RAW_IDEAL_RECOVERY.edges, seed + 1),
          mapVersion: RAW_IDEAL_RECOVERY.mapVersion,
        };
        const shuffledNorm = normalizeRecoveryMap(shuffledRaw);
        const r = gradeRecoveryMap(shuffledNorm, IDEAL_NORM);
        if (r.errors.length !== 0 || JSON.stringify(r.errors) !== JSON.stringify(baseline.errors)) allMatch = false;
      }
      check('RT2: ノード/エッジ配列シャッフル後も自己比較0誤り・順序非依存（複数シード）', allMatch, true, allMatch);
    }

    {
      const idRemap = new Map(RAW_IDEAL_RECOVERY.nodes.map((n, i) => [n.id, `renamed-node-${i}`]));
      const renamed = {
        nodes: RAW_IDEAL_RECOVERY.nodes.map(n => ({ id: idRemap.get(n.id), label: n.label, layerId: n.layerId })),
        edges: RAW_IDEAL_RECOVERY.edges.map((e, i) => ({
          id: `renamed-edge-${i}`, from: idRemap.get(e.from), to: idRemap.get(e.to),
          label: e.label, bidirectional: e.bidirectional,
        })),
        mapVersion: RAW_IDEAL_RECOVERY.mapVersion,
      };
      const renamedNorm = normalizeRecoveryMap(renamed);
      const r = gradeRecoveryMap(renamedNorm, IDEAL_NORM);
      check('RT3: 全ノードID・全エッジID変更 → 0誤り（ラベル照合の証明）', r.errors.length === 0, 0, r.errors.length);
    }

    // ─── 軸0・軸0L ─────────────────────────────────────────
    {
      const learner = buildLearner({ changeNodes: [{ label: 'DWAT', layerId: 1 }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT4: レイヤー1件変更 → layer_mismatch 1', r.counts.layer_mismatch === 1, 1, r.counts.layer_mismatch);
    }
    {
      const learner = buildLearner({ removeNodes: ['DCAT'] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT5: ノード1件削除 → node_missing 1', r.counts.node_missing === 1, 1, r.counts.node_missing);
    }
    {
      const learner = buildLearner({ addNodes: [{ label: '新規団体', layerId: 3 }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT6: 理想外ノード追加 → node_extra 1', r.counts.node_extra === 1, 1, r.counts.node_extra);
    }

    // ─── 軸1 ───────────────────────────────────────────────
    {
      const learner = buildLearner({ removeEdges: [{ fromLabel: '県庁', toLabel: 'C県A保健所', label: '指示命令' }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT7: 県庁→A保健所を削除 → command_missing 1', r.counts.command_missing === 1, 1, r.counts.command_missing);
    }
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '県庁', toLabel: 'C県A保健所', label: '指示命令' }],
        addEdges:    [{ fromLabel: 'C県A保健所', toLabel: '県庁', label: '指示命令', bidirectional: false }],
      });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT8: 指揮方向反転 → command_overuse 1 かつ command_missing 1（相補的2誤り）',
        r.counts.command_overuse === 1 && r.counts.command_missing === 1, [1, 1], [r.counts.command_overuse, r.counts.command_missing]);
    }
    {
      const learner = buildLearner({ addEdges: [{ fromLabel: 'DWAT', toLabel: 'JRAT', label: '指示命令', bidirectional: false }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT9: 理想外ペアに指示命令 → command_overuse 1', r.counts.command_overuse === 1, 1, r.counts.command_overuse);
    }
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '県庁', toLabel: 'C県A保健所', label: '指示命令' }],
        addEdges:    [{ fromLabel: '県庁', toLabel: 'C県A保健所', label: '連携協力', bidirectional: true }],
      });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT10: 理想指揮ペア上に連携協力 → command_missing 1のみ、coordination_path_error 0（J2）',
        r.counts.command_missing === 1 && r.counts.coordination_path_error === 0,
        [1, 0], [r.counts.command_missing, r.counts.coordination_path_error]);
    }

    // ─── 軸2 ───────────────────────────────────────────────
    {
      const learner = buildLearner({ removeEdges: [{ fromLabel: '地域包括支援センター', toLabel: '社会福祉士会', label: '連携協力' }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT11: 理想ハブペア1件削除 → hub_misassignment 1', r.counts.hub_misassignment === 1, 1, r.counts.hub_misassignment);
    }
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '地域包括支援センター', toLabel: '社会福祉士会', label: '連携協力' }],
        addEdges:    [{ fromLabel: '地域包括支援センター', toLabel: '社会福祉士会', label: '指示命令', bidirectional: false }],
      });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT12: 理想ハブペア上に指示命令 → edge_label_error 1（J1）', r.counts.edge_label_error === 1, 1, r.counts.edge_label_error);
    }
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '地域包括支援センター', toLabel: '社会福祉士会', label: '連携協力' }],
        addEdges:    [{ fromLabel: '地域包括支援センター', toLabel: '社会福祉士会', label: '情報伝達', bidirectional: false }],
      });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT13: 理想ハブペア上に情報伝達 → edge_label_error 1（J3例外）', r.counts.edge_label_error === 1, 1, r.counts.edge_label_error);
    }
    {
      // rev B-2：理想外のハブ接続（片端がハブの連携協力）は無罪ではなく hub_misassignment
      // type:"overuse" として計上される（急性期 gradeAxis2() と同一挙動）。
      const learner = buildLearner({ addEdges: [{ fromLabel: 'C県A保健所', toLabel: 'JRAT', label: '連携協力', bidirectional: true }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'hub_misassignment');
      check('RT14: 理想外のハブ接続（片端がハブ）を追加 → hub_misassignment 1・overuse（急性期と同一挙動）',
        r.counts.hub_misassignment === 1 && err?.detail.type === 'overuse', true,
        { count: r.counts.hub_misassignment, type: err?.detail.type });
    }
    {
      // RT15 rev B-2 差し替え：スワップ正規化により2件（欠落＋余剰）にならないことの証明。
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '地域包括支援センター', toLabel: '社会福祉士会', label: '連携協力' }],
        addEdges:    [{ fromLabel: '市町村保健センター', toLabel: '社会福祉士会', label: '連携協力', bidirectional: true }],
      });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'hub_misassignment');
      check('RT15: 社会福祉士会を保健センターに接続 → hub_misassignment 1件・swap・welfareHubAllocation',
        r.counts.hub_misassignment === 1 &&
        err?.detail.type === 'swap' &&
        err?.detail.peripheral === '社会福祉士会' &&
        err?.detail.correctHub === '地域包括支援センター' &&
        err?.detail.wrongHub === '市町村保健センター' &&
        err?.detail.welfareHubAllocation === true,
        true, err && err.detail);
    }
    {
      const learner = buildLearner({ removeEdges: [{ fromLabel: '地域包括支援センター', toLabel: '社会福祉士会', label: '連携協力' }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'hub_misassignment');
      check('RT16: 社会福祉士会がどこにも接続しない → hub_misassignment 1・missing（サブタイプなし）',
        r.counts.hub_misassignment === 1 && err?.detail.type === 'missing' && err?.detail.welfareHubAllocation === undefined,
        true, { count: r.counts.hub_misassignment, type: err?.detail.type, welfareHubAllocation: err?.detail.welfareHubAllocation });
    }
    {
      // RT37（新設）：理想外のハブ接続を1本追加 → hub_misassignment 1件・overuse
      const learner = buildLearner({ addEdges: [{ fromLabel: 'C県A保健所', toLabel: 'DWAT', label: '連携協力', bidirectional: true }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'hub_misassignment');
      check('RT37: 理想外のハブ接続を追加（A保健所↔DWAT） → hub_misassignment 1件・overuse',
        r.counts.hub_misassignment === 1 && err?.detail.type === 'overuse', true, err && err.detail);
    }
    {
      // RT38（新設）：理想ハブペア上に正しい連携協力と指示命令を併存 → J1例外で軸1のcommand_overuse
      const learner = buildLearner({
        addEdges: [{ fromLabel: '地域包括支援センター', toLabel: '社会福祉士会', label: '指示命令', bidirectional: false }],
      });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT38: 理想ハブペア上に連携協力と指示命令が併存 → edge_label_error 0・command_overuse 1（J1例外）',
        r.counts.edge_label_error === 0 && r.counts.command_overuse === 1,
        [0, 1], [r.counts.edge_label_error, r.counts.command_overuse]);
    }
    {
      // RT39（新設）：ハブ間の理想ペアを削除 → peripheral なしのためスワップ正規化されず missing のまま
      // （元データは 市町村保健センター→C県A保健所 の向きで登録されている）
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '市町村保健センター', toLabel: 'C県A保健所', label: '連携協力' }],
      });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'hub_misassignment');
      check('RT39: ハブ間ペア（A保健所↔保健センター）を削除 → hub_misassignment 1件・missing',
        r.counts.hub_misassignment === 1 && err?.detail.type === 'missing', true, err && err.detail);
    }
    {
      // RT40（新設）：DWATを保健センターではなく地域包括支援センターに接続（福祉ハブ振り分けの逆方向）
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '市町村保健センター', toLabel: 'DWAT', label: '連携協力' }],
        addEdges:    [{ fromLabel: '地域包括支援センター', toLabel: 'DWAT', label: '連携協力', bidirectional: true }],
      });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'hub_misassignment');
      check('RT40: DWATを地域包括支援センターに接続 → hub_misassignment 1件・swap・welfareHubAllocation',
        r.counts.hub_misassignment === 1 &&
        err?.detail.type === 'swap' &&
        err?.detail.peripheral === 'DWAT' &&
        err?.detail.correctHub === '市町村保健センター' &&
        err?.detail.wrongHub === '地域包括支援センター' &&
        err?.detail.welfareHubAllocation === true,
        true, err && err.detail);
    }

    // ─── 軸3 ───────────────────────────────────────────────
    {
      const learner = buildLearner({ removeEdges: [{ fromLabel: '医師会', toLabel: '医療機関', label: '支援' }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT17: 理想支援1本削除 → support_missing 1', r.counts.support_missing === 1, 1, r.counts.support_missing);
    }
    {
      const learner = buildLearner({ addEdges: [{ fromLabel: 'JRAT', toLabel: '医療機関', label: '支援', bidirectional: false }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT18: 理想外の支援を追加 → support_overuse 1', r.counts.support_overuse === 1, 1, r.counts.support_overuse);
    }
    {
      // 市町村保健センター→避難所（L2起点）は既に IDEAL_NORM に含まれる。自己比較で当該エッジに
      // support_layer_violation が立たないことを直接確認する（急性期のL3限定規則を流用していれば必ず落ちる）。
      const r = gradeRecoveryMap(IDEAL_NORM, IDEAL_NORM);
      const originIsL2 = IDEAL_NODE_LAYERS_R['市町村保健センター'] === 2;
      const hasViolation = r.errors.some(e =>
        e.category === 'support_layer_violation' && e.detail.fromLabel === '市町村保健センター' && e.detail.toLabel === '避難所');
      check('RT19: 市町村保健センター→避難所（L2起点）が違反にならない（復旧期固有規則の証明）',
        originIsL2 && !hasViolation, true, { originIsL2, hasViolation });
    }
    {
      const learner = buildLearner({ addEdges: [{ fromLabel: 'C県A保健所', toLabel: '避難所', label: '支援', bidirectional: false }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'support_layer_violation' && e.detail.fromLabel === 'C県A保健所');
      check('RT20: C県A保健所→避難所（L1起点）→ support_layer_violation・origin_layer',
        r.counts.support_layer_violation >= 1 && err?.detail.subtype === 'origin_layer', true,
        { count: r.counts.support_layer_violation, subtype: err?.detail.subtype });
    }
    {
      const learner = buildLearner({ addEdges: [{ fromLabel: '避難所', toLabel: '仮設住宅', label: '支援', bidirectional: false }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT21: 避難所→仮設住宅（L4起点）→ support_layer_violation 1',
        r.counts.support_layer_violation === 1, 1, r.counts.support_layer_violation);
    }
    {
      const learner = buildLearner({ addEdges: [{ fromLabel: 'JRAT', toLabel: 'DWAT', label: '支援', bidirectional: false }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'support_layer_violation' && e.detail.fromLabel === 'JRAT' && e.detail.toLabel === 'DWAT');
      check('RT22: 支援の接続先が被支援者でない → support_layer_violation・target_not_beneficiary',
        !!err && err.detail.subtype === 'target_not_beneficiary', true, err && err.detail.subtype);
    }
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '医師会', toLabel: '医療機関', label: '支援' }],
        addEdges:    [{ fromLabel: '医療機関', toLabel: '医師会', label: '支援', bidirectional: false }],
      });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const relevant = r.errors.filter(e => (e.category === 'support_layer_violation' || e.category === 'support_overuse')
        && e.detail.fromLabel === '医療機関' && e.detail.toLabel === '医師会');
      check('RT23: 支援の方向反転 → support_layer_violation/overuse いずれか1件のみ',
        relevant.length === 1, 1, relevant.length);
    }

    // ─── 軸4 ───────────────────────────────────────────────
    {
      const learner = buildLearner({ addEdges: [{ fromLabel: '医師会', toLabel: 'JRAT', label: '連携協力', bidirectional: true }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'coordination_path_error');
      check('RT24: 医師会↔JRAT（L3-L3）連携協力 → coordination_path_error・lateral_coordination',
        r.counts.coordination_path_error === 1 && err?.detail.subtype === 'lateral_coordination', true,
        { count: r.counts.coordination_path_error, subtype: err?.detail.subtype });
    }
    {
      const learner = buildLearner({ addEdges: [{ fromLabel: '県庁', toLabel: '医師会', label: '連携協力', bidirectional: true }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'coordination_path_error');
      check('RT25: 県庁↔医師会 連携協力 → coordination_path_error・command_layer_as_hub',
        r.counts.coordination_path_error === 1 && err?.detail.subtype === 'command_layer_as_hub', true,
        { count: r.counts.coordination_path_error, subtype: err?.detail.subtype });
    }
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: 'JRAT', toLabel: '仮設住宅', label: '支援' }],
        addEdges:    [{ fromLabel: 'JRAT', toLabel: '仮設住宅', label: '連携協力', bidirectional: true }],
      });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT26: 理想支援ペア上に連携協力 → support_missing 1のみ、coordination_path_error 0（J4）',
        r.counts.support_missing === 1 && r.counts.coordination_path_error === 0,
        [1, 0], [r.counts.support_missing, r.counts.coordination_path_error]);
    }
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: 'C県A保健所', toLabel: '医師会', label: '連携協力' }],
        addEdges:    [{ fromLabel: '医師会', toLabel: 'C県A保健所', label: '連携協力', bidirectional: true }],
      });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      check('RT27: 連携協力のfrom/to入れ替え → 0誤り（無方向照合）', r.errors.length === 0, 0, r.errors.length);
    }

    // ─── J3 ────────────────────────────────────────────────
    {
      const learnerAdd = buildLearner({
        addEdges: [{ fromLabel: 'DWAT', toLabel: 'JRAT', label: '情報伝達', bidirectional: false }],
      });
      const learnerRemove = buildLearner({
        removeEdges: [{ fromLabel: 'C県A保健所', toLabel: '県庁', label: '情報伝達' }],
      });
      const rAdd = gradeRecoveryMap(learnerAdd, IDEAL_NORM);
      const rRemove = gradeRecoveryMap(learnerRemove, IDEAL_NORM);
      check('RT28: 任意ペアへの情報伝達追加・削除 → 全カウント不変（採点非干渉）',
        rAdd.errors.length === 0 && rRemove.errors.length === 0, [0, 0], [rAdd.errors.length, rRemove.errors.length]);
    }

    // ─── フラグ ────────────────────────────────────────────
    {
      const learner = buildLearner({ changeNodes: [{ label: '地域包括支援センター', layerId: 3 }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'layer_mismatch' && e.detail.label === '地域包括支援センター');
      check('RT29: 地域包括支援センターをL3に配置 → layer_mismatch 1・phaseCarryover',
        r.counts.layer_mismatch === 1 && err?.flags.phaseCarryover === true, true,
        { count: r.counts.layer_mismatch, flag: err?.flags.phaseCarryover });
    }
    {
      const learner = buildLearner({ addEdges: [{ fromLabel: '歯科医師会', toLabel: '医療機関', label: '支援', bidirectional: false }] });
      const r = gradeRecoveryMap(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'support_overuse' && e.detail.fromLabel === '歯科医師会');
      check('RT30: 歯科医師会→医療機関を追加 → support_overuse 1・phaseCarryover',
        r.counts.support_overuse === 1 && err?.flags.phaseCarryover === true, true,
        { count: r.counts.support_overuse, flag: err?.flags.phaseCarryover });
    }

    // ─── 防御 ──────────────────────────────────────────────
    {
      const rawDup = {
        nodes: [{ id: 'n1', label: 'DWAT', layerId: 3 }, { id: 'n2', label: 'DWAT', layerId: 3 }],
        edges: [],
      };
      let threw = false;
      try { normalizeRecoveryMap(rawDup); } catch (e) { threw = true; }
      check('RT31: ラベル重複で例外スロー', threw, true, threw);
    }
    {
      const rawBroken = {
        nodes: [{ id: 'n1', label: 'DWAT', layerId: 3 }, { id: 'n2', label: 'JRAT', layerId: 3 }],
        edges: [
          { id: 'e1', from: 'n1', to: 'n2', label: '連携協力', bidirectional: true },
          { id: 'e2', from: 'n1', to: 'n-ghost', label: '支援', bidirectional: false },
        ],
      };
      let threw = false, norm = null;
      try { norm = normalizeRecoveryMap(rawBroken); } catch (e) { threw = true; }
      check('RT32: 不正なfrom/to → 例外にせず unresolvedEdgeCount に退避',
        threw === false && norm && norm.edges.length === 1 && norm.unresolvedEdgeCount === 1,
        true, { threw, edges: norm && norm.edges.length, unresolved: norm && norm.unresolvedEdgeCount });
    }
    {
      const audit = auditRecoveryIdealConsistency(IDEAL_NORM);
      check('RT33: 監査 A1〜A9 が理想マップに対して全て通る', audit.ok === true, true, audit);
    }
    {
      const corrupted = normalizeRecoveryMap({
        nodes: RAW_IDEAL_RECOVERY.nodes.map(n => (n.label === 'DWAT' ? Object.assign({}, n, { layerId: 1 }) : n)),
        edges: RAW_IDEAL_RECOVERY.edges,
        mapVersion: RAW_IDEAL_RECOVERY.mapVersion,
      });
      const audit = auditRecoveryIdealConsistency(corrupted);
      check('RT34: 定数を意図的に狂わせた場合に監査が検出する', audit.ok === false && audit.errors.length > 0, false, audit.ok);
    }

    // ─── 位相分離 ──────────────────────────────────────────
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '県庁', toLabel: 'C県A保健所', label: '指示命令' }],
        removeNodes: ['DCAT'],
      });
      const r = gradeRecoveryLayerPhase(learner, IDEAL_NORM);
      const hasEdgeAxisError = r.errors.some(e => e.axis === 1 || e.axis === 2 || e.axis === 3 || e.axis === 4);
      check('RT35: gradeRecoveryLayerPhase が軸1〜4の誤りを返さない',
        !hasEdgeAxisError && r.counts.node_missing === 1, true,
        { hasEdgeAxisError, nodeMissing: r.counts.node_missing });
    }
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '県庁', toLabel: 'C県A保健所', label: '指示命令' }],
        removeNodes: ['DCAT'],
      });
      const r = gradeRecoveryEdgePhase(learner, IDEAL_NORM);
      const hasNodeAxisError = r.errors.some(e => e.axis === 0 || e.axis === '0L');
      check('RT36: gradeRecoveryEdgePhase が軸0・軸0Lの誤りを返さない',
        !hasNodeAxisError && r.counts.command_missing === 1, true,
        { hasNodeAxisError, commandMissing: r.counts.command_missing });
    }

    console.log(`[recovery-scoring.js] テスト完了: ${passed} passed, ${failed} failed`);
    return { passed, failed };
  }

  if (typeof window !== 'undefined') {
    window.__RECOVERY_SCORING_TEST__ = runRecoveryScoringTests;
  }

  if (typeof module !== 'undefined' && require && require.main === module) {
    runRecoveryScoringTests();
  }

})();
