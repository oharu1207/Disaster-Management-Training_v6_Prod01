/* ============================================================
   dev-tools.js  —  開発専用ツール（本番にはコピーしない）
   正解理想マップ（ideal_map）出力機能。
   app.js が公開する window.__ICS_DEV__ に依存する。
   ============================================================ */
(() => {
  // 出力時にノードへ残すフィールド（ホワイトリスト・この順序）
  // 注意：アプリ内のオーサリング用マップのノードは edgeReason を保持していない可能性がある。
  // その状態で正解マップを再エクスポートすると、全ノードの edgeReason が undefined で出力され、
  // 手書きした edge版テキストが黙って失われる。今後 ideal_map_acute.json を再生成する場合は、
  // (a) 先に現行 JSON をインポートして reason 類をアプリ内に取り込んでから編集・再エクスポートするか、
  // (b) エクスポート後に Python 等で現行 JSON の layerReason/edgeReason をマージし直すこと。
  // mapVersion も再エクスポート時に更新が必要（配信ファイルの版を機械可読にログへ残すため）。
  const NODE_FIELDS = ["layerId", "layerReason", "edgeReason", "hintReason", "id", "label", "group", "x", "y"];

  function pickNodeFields(n) {
    const out = {};
    for (const k of NODE_FIELDS) out[k] = n[k];
    return out;
  }

  // ラベル重複検出。重複があれば [{label, count}, ...] を返す。
  function findDuplicateLabels(nodes) {
    const counts = {};
    for (const n of nodes) counts[n.label] = (counts[n.label] || 0) + 1;
    return Object.entries(counts)
      .filter(([, c]) => c > 1)
      .map(([label, count]) => ({ label, count }));
  }

  function exportIdealMap() {
    if (!window.__ICS_DEV__ || typeof window.__ICS_DEV__.getActiveMap !== "function") {
      alert("開発用窓口（__ICS_DEV__）が見つかりません。app.js の DEV-ONLY ブロックが削除されている可能性があります。");
      return;
    }

    const { nodes, edges } = window.__ICS_DEV__.getActiveMap();

    if (!nodes || nodes.length === 0) {
      alert("現在表示中のマップにノードがありません。正解マップを作成するフェーズでノードを配置してから出力してください。");
      return;
    }

    // ラベル重複チェック（致命的なのでダウンロードを中止）
    const dups = findDuplicateLabels(nodes);
    if (dups.length > 0) {
      const lines = dups.map(d => `・${d.label}（${d.count}個）`).join("\n");
      alert("正解マップを出力できません。ノードラベルが重複しています：\n" + lines +
        "\n\nラベルは差分計算の照合キーになるため、重複を解消してから出力してください。");
      return;
    }

    // フラット形式に整形（ノードはホワイトリスト、エッジはそのまま）
    const out = {
      nodes: nodes.map(pickNodeFields),
      edges: edges.map(e => e),
    };

    const mv = window.prompt(
      "mapVersion を入力してください（例: acute-v3-XXe）。空欄なら出力に含めません。",
      (window.idealMapAcute && window.idealMapAcute.mapVersion) || ""
    );
    if (mv) out.mapVersion = mv;

    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ideal_map_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ボタンへのイベント登録
  function bind() {
    const btn = document.getElementById("btnExportIdeal");
    if (btn) btn.addEventListener("click", exportIdealMap);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
