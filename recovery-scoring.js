/**
 * recovery-scoring.js - 復旧期マップ差分判定エンジン
 * スコープ: 純粋ロジック。app.js / DOM / localStorage に依存しない。
 * 急性期 scoring.js（ハブ・指示命令・支援エッジをラベル名でハードコードした採点）とは
 * 独立の実装。復旧期は正解マップ（ideal_map_recovery.json）そのものを正とする単純な
 * label 対応の差分判定（ノード不足/余剰・レイヤー不一致、エッジ不足/余剰・種別誤り/方向誤り）のみを行う。
 * 公開窓口: window.__ICS_RECOVERY_SCORING__ =
 *   { normalizeRecoveryMap, gradeRecoveryLayers, gradeRecoveryEdges, version }
 */

(function () {
  'use strict';

  // 採点規則の版識別。以後の段階でエクスポートの contentVersions に記録される。
  const RECOVERY_RULE_VERSION = 'recovery-diff-v1';

  // 比較時に無方向として扱うラベル。それ以外（指示命令・情報伝達・支援）は有方向。
  const UNDIRECTED_LABELS = new Set(['連携協力']);
  function isUndirectedLabel(label) { return UNDIRECTED_LABELS.has(label); }

  // 無向ペアキー（辞書順ソート + 区切り文字）
  function pairKey(a, b) { return a <= b ? `${a}|||${b}` : `${b}|||${a}`; }

  // ═══════════════════════════════════════════════════════════
  // 正規化層  id → label 変換はこの関数だけが担う
  // ═══════════════════════════════════════════════════════════

  /**
   * rawMap { nodes, edges, mapVersion? } を label 世界へ変換する。
   * 不正な from/to（ノード一覧に存在しない id）を持つエッジは unresolvedEdges に退避し、
   * 処理全体をクラッシュさせない。
   * @throws {Error} ラベル重複時（既存 scoring.js の normalizeMap と同じ設計方針）
   * @returns {{ nodes: {label,layerId}[], edges: {fromLabel,toLabel,label,bidirectional}[],
   *             unresolvedEdges: {from,to,label}[], mapVersion: string|null }}
   */
  function normalizeRecoveryMap(map) {
    if (!map || !Array.isArray(map.nodes) || !Array.isArray(map.edges)) {
      throw new Error('normalizeRecoveryMap: map.nodes / map.edges must be arrays');
    }
    const { nodes, edges } = map;

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

    // 不正な from/to を持つエッジは unresolvedEdges に退避（他カテゴリと二重計上しない）
    const normEdges = [];
    const unresolvedEdges = [];
    for (const e of edges) {
      const fromLabel = idToLabel.get(e.from);
      const toLabel   = idToLabel.get(e.to);
      if (fromLabel === undefined || toLabel === undefined) {
        unresolvedEdges.push({ from: e.from, to: e.to, label: e.label });
        continue;
      }
      normEdges.push({ fromLabel, toLabel, label: e.label, bidirectional: !!e.bidirectional });
    }

    return {
      nodes: normNodes,
      edges: normEdges,
      unresolvedEdges,
      mapVersion: map.mapVersion != null ? map.mapVersion : null,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // レイヤー差分
  // ═══════════════════════════════════════════════════════════

  /**
   * 正規化済みマップ同士のレイヤー差分を判定する純関数。
   * ノードは id ではなく label で対応付ける。
   * @param {ReturnType<normalizeRecoveryMap>} learnerNorm
   * @param {ReturnType<normalizeRecoveryMap>} idealNorm
   */
  function gradeRecoveryLayers(learnerNorm, idealNorm) {
    const errors = [];

    const idealLayerMap = new Map();
    for (const n of idealNorm.nodes) idealLayerMap.set(n.label, n.layerId);

    const learnerLabels = new Set(learnerNorm.nodes.map(n => n.label));

    // レイヤー不一致（理想・学習者双方に存在するラベルのみ対象）
    for (const n of learnerNorm.nodes) {
      if (!idealLayerMap.has(n.label)) continue;
      const expected = idealLayerMap.get(n.label);
      const got = n.layerId;
      if (got !== expected) {
        errors.push({ category: 'layer_mismatch', detail: { label: n.label, expected, got } });
      }
    }

    // ノード不足：理想にあって学習者にないラベル
    for (const n of idealNorm.nodes) {
      if (!learnerLabels.has(n.label)) {
        errors.push({ category: 'node_missing', detail: { label: n.label, expectedLayerId: n.layerId } });
      }
    }

    // ノード余剰：学習者にあって理想にないラベル
    for (const n of learnerNorm.nodes) {
      if (!idealLayerMap.has(n.label)) {
        errors.push({ category: 'node_extra', detail: { label: n.label, got: n.layerId } });
      }
    }

    const counts = { layer_mismatch: 0, node_missing: 0, node_extra: 0 };
    for (const e of errors) counts[e.category]++;

    return {
      errors,
      counts,
      meta: {
        idealNodeCount: idealNorm.nodes.length,
        learnerNodeCount: learnerNorm.nodes.length,
        ruleVersion: RECOVERY_RULE_VERSION,
        mapVersion: idealNorm.mapVersion != null ? idealNorm.mapVersion : null,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // エッジ差分
  // ═══════════════════════════════════════════════════════════

  // 無向ペアキーごとにエッジをグルーピングする（同一ペア上の複数エッジにも対応）
  function buildPairGroups(edges) {
    const map = new Map();
    for (const e of edges) {
      const key = pairKey(e.fromLabel, e.toLabel);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return map;
  }

  /**
   * 正規化済みマップ同士のエッジ差分を判定する純関数。
   * エッジIDは比較しない。端点は label で対応付け、同一ペア上の理想・学習者エッジを
   * 1件ずつ突き合わせる。判定順序は「(1) 関係種別の一致 → (2) 方向の一致」の順で、
   * 種別が食い違った時点で方向判定は行わない（1エッジにつき最大1誤り、二重計上防止）。
   * @param {ReturnType<normalizeRecoveryMap>} learnerNorm
   * @param {ReturnType<normalizeRecoveryMap>} idealNorm
   */
  function gradeRecoveryEdges(learnerNorm, idealNorm) {
    const errors = [];

    const idealGroups   = buildPairGroups(idealNorm.edges);
    const learnerGroups = buildPairGroups(learnerNorm.edges);

    const allKeys = new Set([...idealGroups.keys(), ...learnerGroups.keys()]);

    for (const key of allKeys) {
      const idealList   = idealGroups.get(key)   || [];
      const learnerList = learnerGroups.get(key) || [];
      const matchedCount = Math.min(idealList.length, learnerList.length);

      for (let i = 0; i < matchedCount; i++) {
        const ideal   = idealList[i];
        const learner = learnerList[i];

        // (1) 関係種別の一致チェック。食い違えば edge_label_error のみを計上し、
        //     方向チェックへは進まない（種別誤りと方向誤りの同時発生を防ぐ）。
        if (ideal.label !== learner.label) {
          errors.push({
            category: 'edge_label_error',
            detail: {
              fromLabel: learner.fromLabel, toLabel: learner.toLabel,
              expectedLabel: ideal.label, gotLabel: learner.label,
            },
          });
          continue;
        }

        // (2) 種別が一致した場合のみ方向チェック。無向ラベル（連携協力）は対象外。
        if (!isUndirectedLabel(ideal.label)) {
          const sameDirection = ideal.fromLabel === learner.fromLabel && ideal.toLabel === learner.toLabel;
          if (!sameDirection) {
            errors.push({
              category: 'edge_direction_error',
              detail: { fromLabel: learner.fromLabel, toLabel: learner.toLabel, expectedLabel: ideal.label },
            });
          }
        }
      }

      // 理想側の余り = 関係不足
      for (let i = matchedCount; i < idealList.length; i++) {
        const ideal = idealList[i];
        errors.push({
          category: 'edge_missing',
          detail: {
            fromLabel: ideal.fromLabel, toLabel: ideal.toLabel,
            label: ideal.label, directed: !isUndirectedLabel(ideal.label),
          },
        });
      }

      // 学習者側の余り = 余剰関係
      for (let i = matchedCount; i < learnerList.length; i++) {
        const learner = learnerList[i];
        errors.push({
          category: 'edge_extra',
          detail: {
            fromLabel: learner.fromLabel, toLabel: learner.toLabel,
            label: learner.label, directed: !isUndirectedLabel(learner.label),
          },
        });
      }
    }

    // 不正な from/to を持つ学習者エッジ（normalizeRecoveryMap が退避済み）を記録。
    // normalizeRecoveryMap の時点で normEdges から除外済みのため、他カテゴリと二重計上しない。
    for (const u of (learnerNorm.unresolvedEdges || [])) {
      errors.push({ category: 'edge_unresolved', detail: { from: u.from, to: u.to, label: u.label } });
    }

    const counts = {
      edge_missing: 0, edge_extra: 0, edge_label_error: 0,
      edge_direction_error: 0, edge_unresolved: 0,
    };
    for (const e of errors) counts[e.category]++;

    return {
      errors,
      counts,
      meta: {
        idealEdgeCount: idealNorm.edges.length,
        learnerEdgeCount: learnerNorm.edges.length,
        ruleVersion: RECOVERY_RULE_VERSION,
        mapVersion: idealNorm.mapVersion != null ? idealNorm.mapVersion : null,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // エクスポート
  // ═══════════════════════════════════════════════════════════

  const _exports = {
    normalizeRecoveryMap, gradeRecoveryLayers, gradeRecoveryEdges,
    version: RECOVERY_RULE_VERSION,
  };

  if (typeof window !== 'undefined') {
    window.__ICS_RECOVERY_SCORING__ = _exports;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = _exports;
  }

  // ═══════════════════════════════════════════════════════════
  // テストハーネス
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
    ],
    mapVersion: 'recovery-test-fixture-v1',
  };

  // 正規化済み理想マップ（テスト内で構築した差分バリエーションの土台として使う）
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

    return { nodes, edges, unresolvedEdges: [], mapVersion: IDEAL_NORM.mapVersion };
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

    // ─── Test 1: normalizeRecoveryMap の抽出件数 ────────────
    {
      check('T1: nodes.length = 19', IDEAL_NORM.nodes.length === 19, 19, IDEAL_NORM.nodes.length);
      check('T1: edges.length = 31', IDEAL_NORM.edges.length === 31, 31, IDEAL_NORM.edges.length);
      check('T1: unresolvedEdges.length = 0', IDEAL_NORM.unresolvedEdges.length === 0, 0, IDEAL_NORM.unresolvedEdges.length);
      check('T1: mapVersion 抽出', IDEAL_NORM.mapVersion === 'recovery-test-fixture-v1', 'recovery-test-fixture-v1', IDEAL_NORM.mapVersion);
    }

    // ─── Test 2: 自分自身との比較で差分0件 ──────────────────
    {
      const rLayers = gradeRecoveryLayers(IDEAL_NORM, IDEAL_NORM);
      const rEdges  = gradeRecoveryEdges(IDEAL_NORM, IDEAL_NORM);
      check('T2: layers errors 空', rLayers.errors.length === 0, 0, rLayers.errors.length);
      check('T2: edges errors 空', rEdges.errors.length === 0, 0, rEdges.errors.length);
      check('T2: layers meta.ruleVersion', rLayers.meta.ruleVersion === RECOVERY_RULE_VERSION, RECOVERY_RULE_VERSION, rLayers.meta.ruleVersion);
      check('T2: edges meta.mapVersion', rEdges.meta.mapVersion === 'recovery-test-fixture-v1', 'recovery-test-fixture-v1', rEdges.meta.mapVersion);
    }

    // ─── Test 3: 全ノードID・全エッジIDを変更しても差分0件 ──
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
      const rLayers = gradeRecoveryLayers(renamedNorm, IDEAL_NORM);
      const rEdges  = gradeRecoveryEdges(renamedNorm, IDEAL_NORM);
      check('T3: ID全変更でも layers 差分0', rLayers.errors.length === 0, 0, rLayers.errors.length);
      check('T3: ID全変更でも edges 差分0', rEdges.errors.length === 0, 0, rEdges.errors.length);
    }

    // ─── Test 4: layerId を1件変更 → layer_mismatch = 1 ─────
    {
      const learner = buildLearner({ changeNodes: [{ label: 'DWAT', layerId: 1 }] });
      const r = gradeRecoveryLayers(learner, IDEAL_NORM);
      check('T4: layer_mismatch = 1', r.counts.layer_mismatch === 1, 1, r.counts.layer_mismatch);
      check('T4: errors.length = 1', r.errors.length === 1, 1, r.errors.length);
    }

    // ─── Test 5: ノード欠落 → node_missing ──────────────────
    {
      const learner = buildLearner({ removeNodes: ['DCAT'] });
      const r = gradeRecoveryLayers(learner, IDEAL_NORM);
      check('T5: node_missing = 1', r.counts.node_missing === 1, 1, r.counts.node_missing);
    }

    // ─── Test 6: ノード余剰 → node_extra ────────────────────
    {
      const learner = buildLearner({ addNodes: [{ label: '新規団体', layerId: 3 }] });
      const r = gradeRecoveryLayers(learner, IDEAL_NORM);
      check('T6: node_extra = 1', r.counts.node_extra === 1, 1, r.counts.node_extra);
    }

    // ─── Test 7: エッジ追加（新規ペア）→ edge_extra ─────────
    {
      const learner = buildLearner({
        addEdges: [{ fromLabel: 'DWAT', toLabel: 'JRAT', label: '連携協力', bidirectional: true }],
      });
      const r = gradeRecoveryEdges(learner, IDEAL_NORM);
      check('T7: edge_extra = 1', r.counts.edge_extra === 1, 1, r.counts.edge_extra);
      check('T7: errors.length = 1', r.errors.length === 1, 1, r.errors.length);
    }

    // ─── Test 8: エッジ削除 → edge_missing ──────────────────
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '医師会', toLabel: '医療機関', label: '支援' }],
      });
      const r = gradeRecoveryEdges(learner, IDEAL_NORM);
      check('T8: edge_missing = 1', r.counts.edge_missing === 1, 1, r.counts.edge_missing);
      check('T8: errors.length = 1', r.errors.length === 1, 1, r.errors.length);
    }

    // ─── Test 9: エッジ種別変更 → edge_label_error（方向誤りと同時に立たない）──
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '医師会', toLabel: '医療機関', label: '支援' }],
        addEdges:    [{ fromLabel: '医師会', toLabel: '医療機関', label: '連携協力', bidirectional: true }],
      });
      const r = gradeRecoveryEdges(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'edge_label_error');
      check('T9: edge_label_error = 1', r.counts.edge_label_error === 1, 1, r.counts.edge_label_error);
      check('T9: edge_direction_error = 0（同時に立たない）', r.counts.edge_direction_error === 0, 0, r.counts.edge_direction_error);
      check('T9: detail.expectedLabel = 支援', err?.detail.expectedLabel === '支援', '支援', err?.detail.expectedLabel);
      check('T9: detail.gotLabel = 連携協力', err?.detail.gotLabel === '連携協力', '連携協力', err?.detail.gotLabel);
      check('T9: errors.length = 1', r.errors.length === 1, 1, r.errors.length);
    }

    // ─── Test 10: 支援の逆方向 → edge_direction_error ───────
    // 実機ではUI上被支援者ノードから矢印を引けないため到達不能だが、インポート由来
    // データに対する純関数レベルの防御として検証する。
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: '医師会', toLabel: '医療機関', label: '支援' }],
        addEdges:    [{ fromLabel: '医療機関', toLabel: '医師会', label: '支援', bidirectional: false }],
      });
      const r = gradeRecoveryEdges(learner, IDEAL_NORM);
      const err = r.errors.find(e => e.category === 'edge_direction_error');
      check('T10: edge_direction_error = 1', r.counts.edge_direction_error === 1, 1, r.counts.edge_direction_error);
      check('T10: edge_label_error = 0（同時に立たない）', r.counts.edge_label_error === 0, 0, r.counts.edge_label_error);
      check('T10: detail.expectedLabel = 支援', err?.detail.expectedLabel === '支援', '支援', err?.detail.expectedLabel);
      check('T10: errors.length = 1', r.errors.length === 1, 1, r.errors.length);
    }

    // ─── Test 11: 連携協力の from/to 入れ替えは差分にしない ──
    {
      const learner = buildLearner({
        removeEdges: [{ fromLabel: 'C県A保健所', toLabel: '医師会', label: '連携協力' }],
        addEdges:    [{ fromLabel: '医師会', toLabel: 'C県A保健所', label: '連携協力', bidirectional: true }],
      });
      const r = gradeRecoveryEdges(learner, IDEAL_NORM);
      check('T11: errors.length = 0（無向のため入れ替えは無視）', r.errors.length === 0, 0, r.errors.length);
    }

    // ─── Test 12: ラベル重複防御 ─────────────────────────────
    {
      const rawDup = {
        nodes: [
          { id: 'n1', label: 'DWAT', layerId: 3 },
          { id: 'n2', label: 'DWAT', layerId: 3 }, // 重複
        ],
        edges: [],
      };
      let threw = false;
      try { normalizeRecoveryMap(rawDup); } catch (err) { threw = true; }
      check('T12: ラベル重複で例外スロー', threw, true, threw);
    }

    // ─── Test 13: 不正な from/to は edge_unresolved に退避しクラッシュしない ──
    {
      const rawBroken = {
        nodes: [
          { id: 'n1', label: 'DWAT', layerId: 3 },
          { id: 'n2', label: 'JRAT', layerId: 3 },
        ],
        edges: [
          { id: 'e1', from: 'n1', to: 'n2', label: '連携協力', bidirectional: true },
          { id: 'e2', from: 'n1', to: 'n-not-exist', label: '支援', bidirectional: false }, // 不正な to
          { id: 'e3', from: 'n-ghost', to: 'n2', label: '支援', bidirectional: false },     // 不正な from
        ],
      };
      let threw = false;
      let norm = null;
      try { norm = normalizeRecoveryMap(rawBroken); } catch (err) { threw = true; }
      check('T13: 不正なfrom/toで例外を投げない', threw === false, false, threw);
      check('T13: edges には解決済みの1件のみ', norm && norm.edges.length === 1, 1, norm && norm.edges.length);
      check('T13: unresolvedEdges = 2件', norm && norm.unresolvedEdges.length === 2, 2, norm && norm.unresolvedEdges.length);

      const idealTiny = normalizeRecoveryMap({
        nodes: [{ id: 'n1', label: 'DWAT', layerId: 3 }, { id: 'n2', label: 'JRAT', layerId: 3 }],
        edges: [{ id: 'e1', from: 'n1', to: 'n2', label: '連携協力', bidirectional: true }],
      });
      const r = gradeRecoveryEdges(norm, idealTiny);
      check('T13: edge_unresolved = 2', r.counts.edge_unresolved === 2, 2, r.counts.edge_unresolved);
      check('T13: 他カテゴリと二重計上なし（errors.length = 2）', r.errors.length === 2, 2, r.errors.length);
    }

    // ─── まとめ ──────────────────────────────────────────────
    console.log(`[recovery-scoring.js] テスト完了: ${passed} passed, ${failed} failed`);
    return { passed, failed };
  }

  // ブラウザ向けエクスポート
  if (typeof window !== 'undefined') {
    window.__RECOVERY_SCORING_TEST__ = runRecoveryScoringTests;
  }

  // Node で直接実行された場合は自動テスト
  if (typeof module !== 'undefined' && require && require.main === module) {
    runRecoveryScoringTests();
  }

})();
