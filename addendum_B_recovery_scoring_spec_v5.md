# addendum B：復旧期採点仕様（原則参照方式）rev B-5【統合版】

> **文字化けチェック行**：この行が「■」や「Ã¯Â¼」のように読めない場合、ファイルが UTF-8 以外で渡っています。作業を中止し、その旨を報告してください。復元や推測で作業を進めないでください。

**位置づけ**：`critical_edge_scoring_spec_rev4.md` の付則。復旧期採点エンジン `recovery-scoring.js` および復旧期差分提示フェーズの正本仕様。
**採点規則版**：`RECOVERY_SCORING_RULE_VERSION = "recovery-grade-v2"`
**対象理想マップ**：`ideal_map_recovery.json`（`recovery` セクション、19ノード32エッジ、`mapVersion: "recovery-v1-19n32e"`）

| 版 | 変更 |
|---|---|
| B-1 | 初版。原則参照方式による復旧期採点仕様の確定。急性期9カテゴリを継承しノード集合2カテゴリを追加。ハブ集合を4に拡張、支援起点層規則を L3限定から L2/L3 へ変更。管轄規則 J1〜J4 の復旧期版を規定 |
| B-2 | §B4 R4 の訂正。軸2を急性期 `gradeAxis2()` と同一アルゴリズム（swap / overuse / missing）に修正。§B5.1 を swap の下位判定へ変更。RT15 差し替え、RT37〜RT40 追加 |
| B-3 | B-1 と B-2 を統合。§B12（差分提示フェーズのUI仕様・bundle規則・編集許可・スナップ）を新設。§B13（未決定事項）を新設。RT14 の期待値を B-2 に整合させて訂正 |
| B-4 | §B14（理由テキストのフィールド規約）を新設し、復旧期エッジ側の `edgeReason` を `relationReason` へ改称。ヒント文版 `ht-r1` を確定。§B10 の同期義務に理由テキストを追加。§B13 の未決定事項3（`RECOVERY_MAP` の初期配置）を「現状維持」として決着。UT9・UT10 を追加 |
| B-5 | **本版**。`subtypeCounts` に `swap / overuse / missing` を追加。J2-R を「理想指揮ペア上はラベルを問わず軸1のみ」に実装まで含めて統一。J4-R の適用範囲を「両端とも非ハブの理想支援ペア」に明確化し、ハブ関与時は軸2の過剰と軸3の支援欠落を独立計上する方針を確定。R5 の起点層判定は学習者の現在層ではなく `IDEAL_NODE_LAYERS_R` の規範層を参照することを明記。§B12.4 の未定義カテゴリ `edge_extra` 記述を訂正。RT41〜RT44 を追加し、採点規則版を `recovery-grade-v2` に更新 |

**本版で B-1・B-2・B-3・B-4 の個別ファイルは破棄してください。** 以後の参照は本版のみとします。

---

## §B0 設計方針

### B0.1 原則参照とは何か（本書における定義）

本仕様は「正答集合＋原則規則のハイブリッド」である。急性期エンジン `scoring.js` と同一の構造をとる。

- **正答集合**：`IDEAL_COMMAND_EDGES_R` / `IDEAL_HUB_PAIRS_R` / `IDEAL_SUPPORT_EDGES_R` / `IDEAL_NODE_LAYERS_R`。理想マップの写像として明示宣言する
- **原則規則**：正答集合に載っていないエッジを ICS 原則だけで裁く規則。`support_layer_violation` / `coordination_path_error` / `command_overuse` / `edge_label_error` がこれに当たる

この二階建てにより、「正解と違う」だけでなく「なぜ誤りか」を出力できる。誤りの分類は採点時点で確定するため、後段の分類層は不要である。

### B0.2 エンジン分離の原則

`scoring.js` は凍結する。復旧期の実装のために `scoring.js` を変更してはならない。既取得ログの再現性と42件の回帰テストがその凍結によって担保されている。

共通ヘルパ（`pairKey` / `normalizeMap` 等）は**共有モジュール化せず複製する**。数十行の重複は、急性期エンジンの凍結を守る対価として妥当である。

### B0.3 動的導出の禁止

正答集合を理想JSONから機械的に導出してはならない。「連携協力の次数が2以上ならハブ」といった規則は破綻する（医師会が保健所・地域災害医療コーディネーターの2本を持つためハブに誤分類される）。

正答集合は明示宣言し、理想JSONとの一致を起動時監査（§B7）で検査する。

### B0.4 学習フィードバックとの関係

差分ウォークスルーは本エンジンの `errors` から bundle を構築する（急性期と同一）。差分提示専用のエンジンは持たない。

軸と `principleGroup` は測定用の構成概念であり、**学習者画面に表示してはならない**。表示すると学習者がラベルから正答を逆算でき、測定と学習の分離が崩れる。

---

## §B1 レイヤーと正答集合の宣言

### B1.1 ノード集合とレイヤー（軸0の正答）

```js
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
const BENEFICIARIES_R = new Set(['避難所','医療機関','福祉避難所','在宅避難者','仮設住宅']);
```

計19ノード（L1:2／L2:3／L3:9／L4:5）。

初期配置済み12ノード、学習者追加7ノード（DCAT・介護支援専門員協会・地域支え合いセンター・社会福祉士会・福祉避難所・在宅避難者・仮設住宅）。**この7ノードの過不足が軸0の測定対象**である。急性期は全ノード所与のため軸0を持たない。

### B1.2 軸1：指揮系統の正答

```js
const IDEAL_COMMAND_EDGES_R = new Set(['県庁|C県A保健所']);           // 有向 from|to
const IDEAL_COMMAND_PAIRS_R = new Set([pairKey('県庁','C県A保健所')]); // 無向
```

急性期の `C県A保健所|DHEAT` は DHEAT 撤退により存在しない。

理想マップには `C県A保健所 → 県庁` の情報伝達が1本あるが、**J3-R（§B6.4）により採点対象外**とする。急性期の理想マップも情報伝達2本を持ちながら採点対象外としており、位相間で扱いを揃える。位相によって情報伝達の採点可否が変わると、急性期で無干渉と学習した行動が復旧期で減点対象になり、不当な位相間非対称が生じる。

### B1.3 軸2：ハブ集合と理想ハブ接続の正答

```js
const HUBS_R = new Set([
  'C県A保健所', '地域災害医療コーディネーター', '市町村保健センター', '地域包括支援センター',
]);
```

急性期の3ハブに**地域包括支援センターを追加**する（L3実働組織からL2調整ハブへの昇格）。これは復旧期の構造変換の中核であり、追加しないと理想マップ自身が軸4で2件の誤りを出す。

```js
const IDEAL_HUB_PAIRS_RAW_R = [
  // C県A保健所 ハブ
  ['C県A保健所', '地域災害医療コーディネーター'],
  ['C県A保健所', '歯科医師会'],
  ['C県A保健所', '医師会'],
  ['C県A保健所', 'W民間団体'],
  ['C県A保健所', '地域包括支援センター'],
  ['C県A保健所', '市町村保健センター'],
  // 地域災害医療コーディネーター ハブ
  ['地域災害医療コーディネーター', '医師会'],
  // 市町村保健センター ハブ
  ['市町村保健センター', 'JRAT'],
  ['市町村保健センター', 'DWAT'],
  ['市町村保健センター', 'DCAT'],
  ['市町村保健センター', '地域包括支援センター'],
  ['市町村保健センター', '地域支え合いセンター'],
  // 地域包括支援センター ハブ
  ['地域包括支援センター', '社会福祉士会'],
  ['地域包括支援センター', '介護支援専門員協会'],
];
```

計14ペア（無向、重複排除済み）。医師会は保健所とコーディネーターの2ハブに接続する（複数ハブ接続は許容される）。

うち4ペアは**ハブ同士**の接続である（保健所–コーディネーター／保健所–保健センター／保健所–地域包括／保健センター–地域包括）。これらは `peripheral` を持たないためスワップ正規化の対象にならない（§B4 R4-5）。

### B1.4 軸3：支援の正答

```js
const IDEAL_SUPPORT_EDGES_R = new Set([
  '医師会|医療機関',
  '医師会|避難所', '歯科医師会|避難所', 'W民間団体|避難所',
  'DWAT|避難所', 'DCAT|避難所', 'JRAT|避難所',
  'DWAT|福祉避難所', '地域包括支援センター|福祉避難所',
  'JRAT|仮設住宅', '地域支え合いセンター|仮設住宅',
  '介護支援専門員協会|在宅避難者', '地域支え合いセンター|在宅避難者',
  '市町村保健センター|避難所', '市町村保健センター|仮設住宅', '市町村保健センター|在宅避難者',
]);

// J4用。IDEAL_SUPPORT_EDGES_R から機械的に導出する（独立の真実を持たない）
const IDEAL_SUPPORT_PAIRS_UNDIRECTED_R = new Set(
  [...IDEAL_SUPPORT_EDGES_R].map(k => { const [f,t] = k.split('|'); return pairKey(f,t); })
);
```

計16本。うち4本（市町村保健センター発3本、地域包括支援センター発1本）が**L2起点**であり、急性期の「支援はL3起点に限る」規則が復旧期では成立しないことの根拠となる。

---

## §B2 軸の定義

| 軸 | 名称 | 対象 | 急性期との対応 |
|---|---|---|---|
| 軸0 | 組織集合 | ノードの過不足 | **復旧期のみ**（急性期は全ノード所与） |
| 軸0L | レイヤー配置 | ノードの層 | 同一 |
| 軸1 | 指揮系統 | 指示命令エッジ | 正答集合が縮小（DHEAT撤退） |
| 軸2 | ハブ接続 | 連携協力エッジ | アルゴリズム同一、定数のみ復旧期用 |
| 軸3 | 支援 | 支援エッジ | **起点層規則を変更**（L3→L2/L3） |
| 軸4 | 調整経路 | 非ハブ間の連携協力 | ハブ集合の拡張により対象が変化 |

軸0とは別に軸0Lを置くのは、フェーズ15（レイヤー差分）とフェーズ16（関係差分）の測定を分離するためである。フェーズ15では軸0・軸0Lのみを採点する。

---

## §B3 誤りカテゴリと principleGroup

```js
const CATEGORY_GROUP_R = {
  // 急性期と共通の9カテゴリ（位相間比較の基準）
  layer_mismatch:          ICS_PURE,
  command_overuse:         ICS_PURE,
  command_missing:         ICS_PURE,
  edge_label_error:        ICS_PURE,
  support_layer_violation: ICS_PURE,
  hub_misassignment:       DOMAIN_INTEGRATED,
  support_missing:         DOMAIN_INTEGRATED,
  support_overuse:         DOMAIN_INTEGRATED,
  coordination_path_error: DOMAIN_INTEGRATED,
  // 復旧期で追加する2カテゴリ
  node_missing:            DOMAIN_INTEGRATED,
  node_extra:              DOMAIN_INTEGRATED,
};
```

**カテゴリを新設してはならない。** 福祉ハブ振り分けと位相繰り越しは、カテゴリではなく**サブタイプとフラグ**で表現する（§B5）。カテゴリを増やすと急性期との9分類対応が崩れ、位相間比較が成立しなくなる。

`node_missing` / `node_extra` は原則参照でも正答参照でもなく**教材参照**（表2に撤退と記載されているか）である。この性質を論文の測定節に明記すること。

---

## §B4 判定規則

### R1 レイヤー（軸0L）
学習者ノードの `layerId` が `IDEAL_NODE_LAYERS_R` と異なる → `layer_mismatch`
detail: `{ label, expected, got }`

### R2 組織集合（軸0）
- 理想に存在し学習者に存在しないラベル → `node_missing`　detail: `{ label, expectedLayerId }`
- 学習者に存在し理想に存在しないラベル → `node_extra`　detail: `{ label, got }`

`node_missing` のノードに接続すべきエッジは、エッジ軸でも欠落として計上される（二重計上ではなく、異なる軸の別事象として扱う）。分析時に軸0を除いた集計も可能なよう、軸別カウントを分けて記録する。

### R3 指揮系統（軸1）
- `IDEAL_COMMAND_EDGES_R` の欠落 → `command_missing`
- 理想指揮ペア外に引かれた指示命令 → `command_overuse`
- 方向反転（`C県A保健所 → 県庁` の指示命令）→ `command_overuse` ＋ `command_missing` の**相補的2誤り**（急性期と同じ。指揮の方向性そのものが測定対象のため正規化しない）

### R4 ハブ接続（軸2）

急性期 `gradeAxis2()` と**同一のアルゴリズム**を用いる。定数のみ復旧期用（`HUBS_R` 4件、`IDEAL_HUB_PAIRS_R` 14ペア）に差し替える。

`hub_misassignment` は3つのサブタイプで計上する。

```js
{ type: 'swap',    peripheral, correctHub, wrongHub }  // 取り違え。missing を1件消費し1誤りに正規化
{ type: 'overuse', fromLabel, toLabel }                // 理想外のハブ接続
{ type: 'missing', fromLabel, toLabel }                // 理想ハブペアの欠落
```

#### R4-1 対象エッジの抽出
学習者エッジのうち、次をすべて満たすものを軸2の入力とする。

- ラベルが `支援` でない（支援は軸3管轄）
- 無向ペアが理想指揮ペアでない（J2-R により軸1管轄）
- 少なくとも一端が `HUBS_R` に属する
- `情報伝達` の場合、理想ハブペア上にあること（J3-R によりそれ以外は対象外）
- `指示命令` の場合、理想ハブペア上にあり、かつ同一ペア上に学習者の `連携協力` が併存しないこと（J1-R 例外により併存時は軸1管轄）

#### R4-2 第1パス：理想ペアとの照合
学習者エッジの無向ペアが未消費の理想ハブペアと一致する場合、そのペアを消費し当該エッジを照合済みとする。ラベルが `連携協力` でなければ `edge_label_error` を計上する（`expectedLabel: "連携協力"`）。

同一ペア上に複数の学習者エッジがある場合、理想ペアは1回だけ消費される。残りは第2パスへ送る（**「重複は無罪」としてはならない**）。

#### R4-3 第2パス：スワップと過剰
未照合の学習者エッジについて、両端のうち非ハブ側を `peripheral` とする（両端ともハブの場合は `peripheral` なし）。

- `peripheral` が存在し、その組織を含む**未消費の missing ペア**がある場合 → `type: "swap"` を1件計上し、当該 missing ペアを消費する
- それ以外 → `type: "overuse"` を1件計上する

#### R4-4 残存 missing
スワップで消費されなかった理想ハブペアについて `type: "missing"` を1件計上する。

#### R4-5 復旧期固有の注意
`IDEAL_HUB_PAIRS_R` のうち4ペアはハブ同士の接続であり、`peripheral` を持たないためスワップ正規化の対象にならず、欠落は `type:"missing"` のまま残る。急性期にも同型のハブ間ペアが存在し、扱いは同一である。

### R5 支援（軸3）
- `IDEAL_SUPPORT_EDGES_R` の欠落 → `support_missing`
- 理想外の支援エッジ → `support_overuse`
- 起点レイヤーが L2 でも L3 でもない支援 → `support_layer_violation`（subtype: `origin_layer`）
- 終点が被支援者でない支援 → `support_layer_violation`（subtype: `target_not_beneficiary`）

**判定順序**：`support_layer_violation` を先に判定し、該当した場合は `support_overuse` を計上しない（1エッジ最大1誤り）。

**起点層の参照規約（B-5で明確化）**：起点層の判定には、学習者が現在配置している `layerId` ではなく、`IDEAL_NODE_LAYERS_R` に定義された当該組織の**規範層**を用いる。レイヤー配置の誤りは軸0Lで独立に評価し、同じ配置誤りを原因として軸3にも `support_layer_violation` を波及させない。理想外ノードは規範層を持たないため、支援起点となった場合は `origin_layer` とする。

**急性期との差異（最重要）**：急性期は起点をL3に限定するが、復旧期はL2の調整ハブ（市町村保健センター・地域包括支援センター）からの直接支援を正常とする。これは緩和ではなく、「復旧期には調整機能と直接サービス提供が行政組織に統合される」という位相特有の原則である。論文では位相ごとに規則が異なることを明記し、規則版で識別すること。

L1（県庁・A保健所）からの支援、およびL4（被支援者）からの支援は、両位相で違反である。

### R6 調整経路（軸4）
両端とも `HUBS_R` に該当しないノード間の連携協力 → `coordination_path_error`（無向、J4-R 除外を除く）

理想マップに非ハブ間の連携協力は存在しないため、照合は過剰側のみで欠落側は定義されない。

サブタイプ：
- `command_layer_as_hub`：県庁（L1指揮層）が関与するもの
- `lateral_coordination`：上記以外（L3–L3、L3–L4 等）

急性期の `command_support_as_hub`（DHEAT関与）は、DHEAT撤退により復旧期では対象なし。

---

## §B5 サブタイプとフラグ

### B5.1 welfare_hub_allocation（hub_misassignment の下位判定）

`hub_misassignment` `type: "swap"` が計上され、かつ次をすべて満たす場合に `detail.welfareHubAllocation = true` を付与する。

- `correctHub` と `wrongHub` がともに `{ 市町村保健センター, 地域包括支援センター }` に属する
- `peripheral` が福祉分野の組織である（社会福祉士会／介護支援専門員協会／地域支え合いセンター／DWAT／DCAT／JRAT）

`type: "missing"`（どのハブにも接続していない）にはサブタイプを付けない。これは構造そのものの欠落であり、主要指標に含める。

**集計方針**：エンジンは生の値を出力し、`counts` / `axisCounts` / `groupCounts` から除外しない。主要指標からの控除は分析層（`extract_measures.py` 以降）の責務とする。エンジンに集計方針を焼き込むと、判断を変えたときに再採点が必要になるため。

### B5.2 phase_carryover（フラグ）

急性期の正解構造をそのまま持ち込んだ誤り。カテゴリではなく既存エラーに立てるフラグとする。

```js
const CARRYOVER_LAYER_R = { '地域包括支援センター': 3 };  // 急性期のL3のまま置いた
const CARRYOVER_EDGES_R = new Set([
  '歯科医師会|医療機関',           // 急性期正解、復旧期は不要
  '地域包括支援センター|避難所',   // 復旧期は福祉避難所へ
]);
```

- `layer_mismatch` で `got` が急性期の層と一致 → `flags.phaseCarryover = true`
- `support_overuse` で該当エッジ → 同上

検出可能な項目は3件と少ないが、レイヤーの1件（地域包括支援センターの昇格失敗）は適応的熟達の失敗を最も直接に示す観測点である。パイロットで分散を確認し、主要指標への昇格を判断する。

---

## §B6 管轄規則（復旧期版）

エッジの帰属は「そのエッジが引かれた**無向ペアが理想マップ上で何であるか**」で決める。学習者が付けたラベルは二次的。

### B6.1 判定順序（この順に適用し、確定したら以降の軸へ流さない）

```
0. 端点がノードラベルに解決できないエッジ → 未解決として退避（他軸へ流さない、例外にしない）
1. 情報伝達 → J3-R
2. 理想指揮ペア上 → **ラベルを問わず軸1のみ**（J2-R。支援であっても軸3へ流さない）
3. 理想ハブペア上 → 軸2（J1-R）
4. ラベル＝支援 → 軸3（R5）
5. **両端とも非ハブ**で、かつ理想支援ペア上の連携協力 → 軸3（J4-R）
6. 両端とも非ハブの連携協力 → 軸4（R6）
7. 片端がハブの連携協力（理想ハブペア外）→ 軸2の第2パスへ（R4-3。overuse または swap）。その無向ペアが理想支援ペアでもある場合、本来の支援欠落は軸3で独立に計上する
```

### B6.2 J1-R：理想ハブペア上の指示命令は軸2管轄
理想ハブペア上に引かれた指示命令は `edge_label_error`（軸2）とする。「接続先は正しいが関係の種類を誤った」と解釈するため。

**J1例外**：同一の理想ハブペア上に正しい連携協力が併存する場合に限り、その指示命令は軸1の `command_overuse` とする。UI のペア排他ガードにより学習者操作では到達不能であり、インポート等の任意入力に対するエンジン防御として規定する。

### B6.3 J2-R：理想指揮ペア上のエッジは軸1のみが管轄
理想指揮ペア（県庁｜C県A保健所）上のエッジは、**ラベルを問わず軸1のみ**が管轄する。当該ペア上に連携協力を引いた場合は `command_missing` のみを計上し `coordination_path_error` は計上しない。支援を引いた場合も同様に、`command_missing` のみを計上し、軸3の `support_layer_violation` / `support_overuse` へは流さない。

これは「理想上そのペアが何を表すか」を先に確定してから軸を割り当てる §B6 の原則を徹底するためである。方向反転した**指示命令**だけは R3 により `command_missing` ＋ `command_overuse` の相補的2誤りとする。

### B6.4 J3-R：情報伝達の管轄
情報伝達は**原則として採点対象外**とする。学習者マップへの追加・削除はいずれの誤りカウントも変化させない。

唯一の例外は理想ハブペア上に引かれた場合で、このとき `edge_label_error`（軸2）として計上する。

理想マップの `C県A保健所 → 県庁` 情報伝達は、この規則により採点されない。監査の比較対象にも含めない。急性期と完全に同一の扱いである。

### B6.5 J4-R：両端とも非ハブの理想支援ペア上の連携協力は軸3管轄
J4-R は、**両端とも `HUBS_R` に属さない理想支援ペア**上に連携協力が引かれた場合に適用する。この場合は `support_missing` のみを計上し、`coordination_path_error` は計上しない。

例：`JRAT｜仮設住宅` は理想では `JRAT → 仮設住宅` の支援である。ここに連携協力を引いた場合、`support_missing` 1件のみとする。

一方、市町村保健センター・地域包括支援センターのような**ハブが関与する理想支援ペア**に連携協力を引いた場合は J4-R を適用しない。連携協力自体は軸2の理想外ハブ接続として `hub_misassignment`（通常 `type:"overuse"`）を計上し、本来の支援が存在しないことは軸3で `support_missing` として独立に計上する。

例：理想が `市町村保健センター → 避難所` の支援であるところを `市町村保健センター ↔ 避難所` の連携協力に置き換えた場合、
- 軸2：`hub_misassignment` `type:"overuse"` 1件
- 軸3：`support_missing` 1件
とする。

これは同一事象の二重計上ではなく、「ハブから不要な調整接続を作ったこと」と「必要な支援関係が欠落したこと」を異なる軸で観測するものである。
---

## §B7 監査項目

`auditRecoveryIdealConsistency(idealMap)` — 副作用なしの純粋関数。ログ記録は呼び出し側の責務。

| 検査 | 内容 | 不一致時 |
|---|---|---|
| A1 | ノード数＝19、エッジ数＝32 | 警告（`ok: true` を維持） |
| A2 | ノードラベル集合＝`IDEAL_NODE_LAYERS_R` のキー集合 | エラー |
| A3 | 各ノードの `layerId` が宣言と一致 | エラー |
| A4 | 指示命令エッジ集合＝`IDEAL_COMMAND_EDGES_R` | エラー |
| A5 | 連携協力の無向ペア集合＝`IDEAL_HUB_PAIRS_R` | エラー |
| A6 | 支援エッジ集合＝`IDEAL_SUPPORT_EDGES_R` | エラー |
| A7 | ノードラベルの重複がない | エラー |
| A8 | 全エッジの端点がノードIDに解決できる | エラー |
| A9 | 理想マップの自己採点が0誤り | エラー |
| A10 | 情報伝達エッジは検査しない（J3-R により採点対象外） | — |

エラー時は ready にせず、採点を実行しない。警告は ready を維持する。

**A9 は最も重要な検査である。** 宣言定数と規則の整合を一括で保証する。理想マップ同士では全ペアが第1パスで消費されるため `overuse` は発生しない。A9 が通らない場合は第1パスの消費処理を疑うこと。

---

## §B8 出力形式

### B8.1 主関数

```js
gradeRecoveryMap(learnerMap, idealMap)          // 全軸
gradeRecoveryLayerPhase(learnerMap, idealMap)   // 軸0・軸0L のみ（フェーズ15用）
gradeRecoveryEdgePhase(learnerMap, idealMap)    // 軸1〜4 のみ（フェーズ16用）
normalizeRecoveryMap(map)
auditRecoveryIdealConsistency(idealMap)
```

公開グローバル：`window.__ICS_RECOVERY_SCORING__`（`window.__ICS_SCORING__` とは分離）

### B8.2 戻り値

```js
{
  errors: [
    {
      category,                 // §B3 の11種
      principleGroup,           // "ics_pure" | "domain_integrated"
      axis,                     // 0 | "0L" | 1 | 2 | 3 | 4
      detail: { ... },          // カテゴリごとに §B4 で規定
      flags: { phaseCarryover: false },
    },
  ],
  counts: { /* カテゴリ別 */ },
  axisCounts: { axis0, axis0L, axis1, axis2, axis3, axis4 },
  groupCounts: { ics_pure, domain_integrated },
  subtypeCounts: { swap, overuse, missing, welfare_hub_allocation,
                   lateral_coordination, command_layer_as_hub,
                   origin_layer, target_not_beneficiary },
  flagCounts: { phaseCarryover },
  meta: { idealNodeCount, idealEdgeCount, learnerNodeCount, learnerEdgeCount,
          ruleVersion, mapVersion, unresolvedEdgeCount },
}
```

`subtypeCounts.swap / overuse / missing` は、`hub_misassignment` の `detail.type` から集計する。`welfare_hub_allocation` は `type:"swap"` かつ `detail.welfareHubAllocation === true` の件数である。これらは `counts` / `axisCounts` / `groupCounts` から除外するための値ではなく、同じ生データを別粒度で保持する補助集計である。

`errors` は決定的な順序で返す（軸→カテゴリ→ラベル辞書順）。配列順に依存する処理を呼び出し側に作らせないため。

### B8.3 エッジ照合の順序非依存性

学習者マップと理想マップの照合は、配列インデックスに依存してはならない。同一無向ペア上に複数エッジが存在し得るため（理想では県庁｜A保健所ペアが指示命令＋情報伝達の2本、学習者側では支援の重複も起こり得る）、集合ベースまたは消費フラグ付きの照合で実装すること。

### B8.4 例外

ノードラベルの重複を含むマップを渡した場合は例外を投げる（急性期 `normalizeMap` と同じ）。呼び出し側は必ず try/catch し、`RECOVERY_GRADING_SKIPPED` をログに残すこと。

---

## §B9 自己テスト一覧

`node recovery-scoring.js` で実行。全44件成功を完了条件とする。

### 基本
- **RT1** 理想＝学習者 → 全カテゴリ0誤り
- **RT2** ノード配列・エッジ配列をシャッフルして自己比較 → 0誤り（順序非依存の証明。固定シードで複数パターン）
- **RT3** 全ノードID・全エッジIDを変更 → 0誤り（ラベル照合の証明）

### 軸0・軸0L
- **RT4** レイヤー1件変更 → `layer_mismatch` 1
- **RT5** ノード1件削除 → `node_missing` 1
- **RT6** 理想外ノード追加 → `node_extra` 1

### 軸1
- **RT7** 県庁→A保健所を削除 → `command_missing` 1
- **RT8** 指揮方向反転 → `command_overuse` 1 ＋ `command_missing` 1（相補的2誤り）
- **RT9** 理想外ペアに指示命令 → `command_overuse` 1
- **RT10** 理想指揮ペア上に連携協力 → `command_missing` 1 のみ、`coordination_path_error` 0（J2-R）

### 軸2
- **RT11** 理想ハブペア1件を削除 → `hub_misassignment` 1
- **RT12** 理想ハブペア上に指示命令 → `edge_label_error` 1（J1-R）
- **RT13** 理想ハブペア上に情報伝達 → `edge_label_error` 1（J3-R 例外）
- **RT14** 理想外のハブ接続を追加 → `hub_misassignment` 1、`type === "overuse"`
　※ B-1 では「0誤り」としていたが B-2 の訂正により変更
- **RT15** 社会福祉士会を地域包括支援センターではなく市町村保健センターに接続 → `hub_misassignment` **1件**、`type === "swap"`、`peripheral === "社会福祉士会"`、`correctHub === "地域包括支援センター"`、`wrongHub === "市町村保健センター"`、`welfareHubAllocation === true`（スワップ正規化により2件にならないことの証明）
- **RT16** 社会福祉士会をどのハブにも接続しない → `hub_misassignment` 1、`type === "missing"`、サブタイプなし

### 軸3
- **RT17** 理想支援1本を削除 → `support_missing` 1
- **RT18** 理想外の支援を追加 → `support_overuse` 1
- **RT19** **市町村保健センター→避難所（L2起点）が違反にならない**（復旧期固有規則の証明）
- **RT20** C県A保健所→避難所（L1起点）→ `support_layer_violation` 1、subtype `origin_layer`
- **RT21** 避難所→仮設住宅（L4起点）→ `support_layer_violation` 1
- **RT22** 支援の終点が非被支援者 → `support_layer_violation` 1、subtype `target_not_beneficiary`
- **RT23** 支援の方向反転 → 1件のみ（UI上到達不能だがインポート防御）

### 軸4
- **RT24** 医師会↔JRAT（L3–L3）に連携協力 → `coordination_path_error` 1、subtype `lateral_coordination`
- **RT25** 県庁↔医師会に連携協力 → `coordination_path_error` 1、subtype `command_layer_as_hub`
- **RT26** 理想支援ペア（JRAT｜仮設住宅）上に連携協力 → `support_missing` 1 のみ、`coordination_path_error` 0（J4-R）
- **RT27** 連携協力の from/to 入れ替え → 0誤り（無方向照合）

### J3
- **RT28** 任意ペアに情報伝達を追加・削除 → 全カウント不変（採点非干渉）

### フラグ
- **RT29** 地域包括支援センターをL3に配置 → `layer_mismatch` 1 ＋ `flags.phaseCarryover: true`
- **RT30** 歯科医師会→医療機関を追加 → `support_overuse` 1 ＋ `flags.phaseCarryover: true`

### 防御
- **RT31** ラベル重複マップ → 例外を投げる
- **RT32** 不正な from/to を含むマップ → 未解決として退避し、例外で停止しない
- **RT33** 監査 A1〜A9 が理想マップに対してすべて通る
- **RT34** 定数を意図的にずらした場合に監査が検出する

### 位相分離
- **RT35** `gradeRecoveryLayerPhase` が軸1〜4のエラーを返さない
- **RT36** `gradeRecoveryEdgePhase` が軸0・軸0Lのエラーを返さない

### 軸2追加（B-2）
- **RT37** 理想外のハブ接続を1本追加（例：C県A保健所 ↔ DWAT の連携協力）→ `hub_misassignment` 1、`type === "overuse"`
- **RT38** 理想ハブペア上に正しい連携協力と指示命令を併存 → `edge_label_error` 0、`command_overuse` 1（J1-R 例外）
- **RT39** ハブ間の理想ペア（C県A保健所 ↔ 市町村保健センター）を削除 → `hub_misassignment` 1、`type === "missing"`（peripheral を持たないためスワップ正規化されない証明）
- **RT40** DWAT を市町村保健センターではなく地域包括支援センターに接続 → `hub_misassignment` 1、`type === "swap"`、`welfareHubAllocation === true`

### B-5追加
- **RT41** 理想指揮ペア（県庁｜C県A保健所）で指示命令を削除し、同じ向きに支援を置く → `command_missing` 1のみ。`support_layer_violation` / `support_overuse` は0（J2-Rがラベルを問わず軸1のみを管轄する証明）
- **RT42** `hub_misassignment` の `type:"swap"` / `"overuse"` / `"missing"` を各1ケース生成し、対応する `subtypeCounts.swap / overuse / missing` がそれぞれ1となる。`counts.hub_misassignment` との整合も確認する
- **RT43** 理想支援 `市町村保健センター → 避難所` を削除して同ペアに連携協力を置く → `hub_misassignment(type:"overuse")` 1 ＋ `support_missing` 1（ハブ関与理想支援ペアにはJ4-Rを適用しない証明）
- **RT44** JRATを学習者マップ上でL1へ誤配置したまま、理想どおり `JRAT → 避難所` の支援を保持 → `layer_mismatch` 1、当該支援に `support_layer_violation` 0（R5が学習者の現在層ではなく規範層を参照する証明）

---

## §B10 版管理と同期義務

規範エッジまたはノードを変更する場合、以下を**同一コミットで**更新する。

1. 本仕様書 §B1（正答集合の宣言）
2. `recovery-scoring.js` の4定数
3. `recovery-scoring.js` 内蔵テストのフィクスチャ
4. `ideal_map_recovery.json`（`mapVersion` を更新）
5. 理由テキスト3種（§B14）。ノードの増減は `hintReason` / `layerReason`、エッジの増減は `relationReason` の追記を伴う
6. `RECOVERY_HINT_TEXTS`（§B14.4。カテゴリを増減した場合）
7. `学習シナリオ.docx`（導出可能性の維持）
8. 統制群教材（学習機会の対称性の維持）

| 軸 | 識別子 |
|---|---|
| mapVersion | `recovery-v1-19n32e` |
| scoringRule | `recovery-grade-v2` |
| flowVersion | `flow-v3-recovery-diff` |
| hintTextsVersion | `ht-r1` |

---

## §B11 急性期との差異（論文記述用）

| 項目 | 急性期 | 復旧期 | 備考 |
|---|---|---|---|
| ハブ数 | 3 | 4 | 地域包括支援センターの昇格＝構造変換の中核 |
| 支援起点層 | L3のみ | L2またはL3 | 位相特有の原則として明記。緩和ではなく統合の反映 |
| ノード集合 | 所与 | 7件が学習者選択 | 復旧期のみ軸0を持つ |
| 情報伝達 | 採点対象外 | 採点対象外 | 位相間で同一（意図的） |
| 軸2アルゴリズム | swap / overuse / missing | 同一 | 定数のみ差し替え。位相間比較の前提 |
| カテゴリ数 | 9 | 11（9＋ノード2） | 共通9分類で位相間比較を行う |
| 判定原理 | 正答集合＋原則規則 | 同一 | 同一構造のため比較可能 |

**注記が必要な事項**：4層構造のうち第4層（被支援者）は FEMA NIMS 3rd ed. (2017) のICS原則には存在しない研究独自の拡張である。また支援起点層の規則が位相間で異なることは、規則の恣意的変更ではなく復旧期の組織機能の実態に基づく設計判断である。

---

## §B12 差分提示フェーズのUI仕様【B-3 新設】

### B12.1 フェーズ構成

```
RECOVERY_MAP(5)          復旧期マップ作成（層配置・エッジ付与を同時に実施）
  ↓
RECOVERY_LAYER_DIFF(15)  差分提示（レイヤー）… 軸0・軸0L
  ↓
RECOVERY_DIFF(16)        差分提示（関係）    … 軸1〜4
  ↓
TRANSITION_COMPARE(6)    急性期・復旧期比較
```

急性期は構築フェーズ自体が層とエッジに分かれるが（`ACUTE_MAP` → `ACUTE_LAYER_DIFF` → `ACUTE_EDGE_MAP` → `ACUTE_DIFF`）、復旧期の構築は `RECOVERY_MAP` 1フェーズで完結する。**構築は1回でも、フィードバックは急性期と同じ2段構成とする。** 理由は2点。

- 支援の起点層判定と調整経路判定は層に依存するため、層を先に確定させないと根本原因でない誤りを提示してしまう
- 学習者は急性期で「層を直す → 関係を直す」を経験済みであり、同じリズムなら混乱しない

### B12.2 bundle 規則

急性期 `bundleKeyOf()` は「カテゴリ1つ＝1束、ただし `layer_mismatch` のみ正解層で細分化」という規則である。復旧期もこれを基本とし、変更は新規2カテゴリの追加のみとする。

| カテゴリ | bundleKey | 急性期からの変更 |
|---|---|---|
| `node_missing` | `node_missing#{正解層}` | 新規。修正動作が層依存のため `layer_mismatch` と同型に細分化 |
| `node_extra` | `node_extra` | 新規。修正動作は「消す」で一律のため単一束 |
| `layer_mismatch` | `layer_mismatch#{正解層}` | なし |
| 他9カテゴリ | category そのまま | なし |

`node_missing` の対象は学習者追加の7ノードのみで、正解層は L3 と L4 に限られる。したがって最大2束にとどまる。

`hub_misassignment` はサブタイプ（swap / overuse / missing）混在のまま1束とする。`coordination_path_error` も同様。これは急性期の扱いと同一である。

**カテゴリ表示順**（`CATEGORY_ORDER` の復旧期版）：

```js
[
  "node_missing", "node_extra", "layer_mismatch",        // フェーズ15
  "command_missing", "command_overuse", "edge_label_error",
  "hub_misassignment", "coordination_path_error",
  "support_layer_violation", "support_missing", "support_overuse",  // フェーズ16
]
```

先頭3件は「組織を置く → 余計なものを消す → 層を直す」という自然な作業順に対応する。

### B12.3 編集許可マトリクス

| 操作 | RECOVERY_MAP(5) | RECOVERY_LAYER_DIFF(15) | RECOVERY_DIFF(16) |
|---|---|---|---|
| ノード追加 | ○ | ○ | × |
| ノード削除 | ○ | ○ | × |
| レイヤー移動 | ○ | ○ | × |
| エッジ操作 | ○ | × | ○ |

フェーズ15でノードの追加・削除を許可するのは、急性期から復旧期への移行において「必要な組織を置き忘れる」「不要な組織を消し忘れる」ことが想定され、ヒント提示を受けてそれを修正できる必要があるためである。

実装上の注意（急性期のフェーズ列挙箇所への追加）：

- `setupDrag()` のレイヤーロック（現状 `ACUTE_EDGE_MAP || ACUTE_DIFF`）に **`RECOVERY_DIFF` を追加**
- `startArrowDraw()` のエッジ操作禁止（現状 `ACUTE_LAYER_REVISE / ACUTE_LAYER_DIFF / ACUTE_REVISE`）に **`RECOVERY_LAYER_DIFF` を追加**
- `renderEdges()` の表示専用判定に `RECOVERY_LAYER_DIFF` を追加
- 削除ボタンの表示条件に `RECOVERY_LAYER_DIFF` を許可として追加（`RECOVERY_DIFF` では非表示）
- フェーズ15のパレットは `RECOVERY_PALETTE_NODES`（`RECOVERY_MAP` と同一）を使用する。撤退組織を除外したパレットにしてはならない。除外すると「何を消すべきか」が可視化され、`node_extra` の測定が壊れる

### B12.4 フェーズ15退出時のスナップ

処理順序は次で固定する。順序が測定上決定的に重要である（急性期の同等処理と同じ理由）。

```
修正後採点（recoveryRevised を入力）
  ↓
スナップ ① 欠落ノードの生成（正解層に配置）
        ② 誤配置ノードを正解層へ移動
  ↓
RECOVERY_DIFF へ遷移
```

**余剰ノードの自動削除は行わない。** 学習者が置いたノードを自動で消すと付随するエッジまで失われ、作業を取り上げる形になるためである。余剰ノードが残ってもフェーズ16の進行は妨げられない。余剰ノードに接続したエッジは未定義の `edge_extra` カテゴリを新設せず、既存の軸1〜4の規則に従って `command_overuse` / `hub_misassignment` / `support_layer_violation` / `support_overuse` / `coordination_path_error` 等として評価する。

①は安全網である。欠落ノードが残ったままフェーズ16へ進むと、繋ぐべき相手が存在せず学習者が詰む。ウォークスルーで正解を提示した後なので、通常は学習者自身が追加済みで no-op となる。

スナップは作業コピー（`recoveryRevised`）にのみ作用する。`recoveryBaseline` と `phaseData.p6` は不変であり、フェーズ16の修正前採点は汚染されない。

採点不能（正解JSON未ロード等）の場合はスナップせず遷移を許し、`RECOVERY_LAYER_SNAP_SKIPPED` をログに残す（学習者を閉じ込めない）。

### B12.5 ログイベント（B12 関連の追加分）

```
RECOVERY_NODE_ADDED        // フェーズ15でのノード追加（label, layerId）
RECOVERY_NODE_DELETED      // フェーズ15でのノード削除（label, 付随削除エッジ数）
RECOVERY_LAYER_SNAPPED     // スナップ実施（生成件数・移動件数の内訳）
RECOVERY_LAYER_SNAP_SKIPPED
```

既存ログイベント名の削除・改名はしない。追加のみとする。

### B12.6 §B12 に対応する追加テスト

- **UT1** フェーズ15でノードを追加・削除でき、フェーズ16ではできない
- **UT2** フェーズ15でエッジ操作ができない／フェーズ16でレイヤーが変更できない
- **UT3** `node_missing` の bundleKey が正解層で分かれる（L3束・L4束）
- **UT4** `node_extra` が単一束になる
- **UT5** スナップが欠落ノードを生成し、余剰ノードを削除しない
- **UT6** スナップ後も `recoveryBaseline` と `phaseData.p6` が不変
- **UT7** 採点不能時にスナップせず遷移でき、`RECOVERY_LAYER_SNAP_SKIPPED` が残る
- **UT8** フェーズ15のパレットが `RECOVERY_MAP` と同一である
- **UT9** 正解開示ステージで、層のWHYがノードの `layerReason`、関係のWHYがエッジの `relationReason` から取得される（§B14）
- **UT10** 復旧期のレンダリング経路がノードの `edgeReason` を参照していない（急性期コードの流用による無言の undefined を防ぐ）

---

## §B13 未決定事項

以下は本仕様の対象外であり、決定後に本書へ追記する。

1. **`hintReason` の執筆**（19件）。復旧期理想マップにはフィールド自体が存在しない。層配置のヒント段階で使用する
2. **`layerReason` の注入**（19件）。現在すべて空文字。文面は別途作成済みのため注入作業のみ
### 決着済みの事項（記録）

- **`RECOVERY_MAP` の初期配置**：現状維持とする。学習者が配置したままの状態を保持し、システムが正しい配置に修正することはしない。この結果として `node_extra` の発生機会は限られるが、本システムは教材が主目的であり、測定機会の最大化のために学習体験を変更しない
- **`relationReason` への改称**：§B14 のとおり決定（B-4）
- **ヒント文版**：`ht-r1`（B-4）
- **J2-R の境界ケース**：理想指揮ペア上はラベルを問わず軸1のみ。支援を置いても軸3へ流さない（B-5）
- **J4-R の適用範囲**：両端とも非ハブの理想支援ペアに限定。ハブ関与時は軸2の過剰接続と軸3の支援欠落を独立計上する（B-5）
- **R5 の起点層参照**：学習者の現在配置層ではなく `IDEAL_NODE_LAYERS_R` の規範層を用いる（B-5）
- **`subtypeCounts`**：`swap / overuse / missing` を必須出力とし、`hub_misassignment.detail.type` から集計する（B-5）

---

## §B14 理由テキストのフィールド規約【B-4 新設】

### B14.1 3種の理由テキスト

急性期・復旧期とも、理由テキストは**開示段階ごとに別フィールド**を持つ。同じ内容の別名ではないため、統合してはならない。

| フィールド | 格納先 | 使用段階 | 内容 |
|---|---|---|---|
| `hintReason` | ノード | ヒント段階 | 正解を開示しない足場。参照先を示すのみ |
| `layerReason` | ノード | 正解開示段階 | なぜその層なのかの説明 |
| `relationReason` | **エッジ** | 正解開示段階 | なぜその関係なのかの説明（**復旧期のみ**） |

急性期は関係のWHYを**ノードの `edgeReason`** に持つ（1ノードのテキストがそのノードの全接続を説明する）。復旧期は**エッジごとに個別のテキスト**を持ち、精度が高い。

### B14.2 `edgeReason` を使わない理由

復旧期のエッジ側フィールドを `edgeReason` と名付けてはならない。急性期のレンダリングは `idealNodeMap[label]?.edgeReason` の形でノードから引いており、同名のまま格納先だけが違うと、急性期コードを流用した際に**例外も警告も出さずに `undefined` が返る**。理由欄が空になるだけなので、テストでも見逃されやすい。

名前を分けておけば、流用時に「`relationReason` というフィールドはノードに存在しない」ことが即座に分かり、正しい参照先へ誘導される。

### B14.3 復旧期理想マップのスキーマ

```jsonc
{
  "recovery": {
    "mapVersion": "recovery-v1-19n32e",
    "nodes": [
      {
        "id": "...", "label": "...", "group": "...", "x": 0, "y": 0,
        "layerId": 1,
        "isInitial": true,
        "hintReason": "…",   // ヒント段階（19件・要執筆）
        "layerReason": "…"   // 正解開示段階（19件・注入待ち）
      }
    ],
    "edges": [
      {
        "id": "...", "from": "...", "to": "...", "label": "連携協力",
        "bidirectional": true,
        "relationReason": "…"  // 正解開示段階（32件・記入済み。edgeReason から改称）
      }
    ]
  }
}
```

**改称作業**：現在の `ideal_map_recovery.json` はエッジ側に `edgeReason` を持つ。キー名を `relationReason` へ機械的に置換する。値・順序・他のキーは一切変更しない。改称に伴い `mapVersion` は変更しない（規範内容が変わらないため）。

### B14.4 参照規約

- 層の誤り（`layer_mismatch`）のヒント → `RECOVERY_HINT_TEXTS.layer_mismatch` ＋ 対象ノードの `hintReason` を合成
- 層の誤りの正解開示 → 対象ノードの `layerReason`
- 関係の誤り（軸1〜4）の正解開示 → 対象エッジの `relationReason`
- 関係の誤りのヒント → `RECOVERY_HINT_TEXTS[category]` のみ（エッジのWHYは正解を含むため、開示前に使用してはならない）

**禁止事項**：復旧期のレンダリング経路でノードの `edgeReason` を参照してはならない。復旧期理想マップのノードにこのフィールドは存在しない。

### B14.5 未整備時のフォールバック

`hintReason` / `layerReason` / `relationReason` が空または未定義の場合、断定的な説明を生成してはならない。差分の事実（どのラベルが第何層であるべきか、どの関係が不足しているか）のみを簡潔に表示し、理由欄は非表示にする。文面を推測で創作しないこと。

### B14.6 ヒント文定数

```js
const RECOVERY_HINT_TEXTS_VERSION = "ht-r1";
const RECOVERY_HINT_TEXTS = { /* §B3 の11カテゴリ ＋ 補助文・サブタイプ用 */ };
```

急性期の `HINT_TEXTS` / `HINT_TEXTS_VERSION` は変更しない。復旧期用は別定数として追加する。

`node_missing` は bundleKey が正解層で分かれるため（`node_missing#3` / `node_missing#4`）、文面も層別に用意してよい。その場合キーは `node_missing_L3` / `node_missing_L4` とする。
