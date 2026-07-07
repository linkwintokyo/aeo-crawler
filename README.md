# AEO Crawler（検証キット）

GitHub Actions のヘッドレスChrome（Playwright）で、日本語GoogleのAI Overview(AIO)を取得できるか検証するための最小構成です。

## これで確かめること
- 指定キーワードで**AIOが出現するか**（`aio_present`）
- **本文テキスト**（`text`）
- **引用ソースのURLと並び順**（`sources`）
- **自社ドメインが引用されているか＋何位か**（`cited` / `cite_position`）
- ページ**スクショ**（artifactの `shot.png`）
- ブロック/CAPTCHA検出（`captcha`）

## 使い方
1. このリポジトリ（専用リポ）に3ファイルを置く：`crawl.mjs` / `.github/workflows/aeo.yml` / `README.md`
2. GitHub → Actions → 「AEO Crawl」→ **Run workflow**。キーワードとドメインを入れて実行。
3. 実行ログの `Show result` で JSON を確認。`Upload artifacts` から `result.json` と `shot.png` をダウンロード。

## 判定の見方
- `aio_present: true` かつ `text` に本文が入っていれば **抜けている**。
- `sources` に外部URLが並び、`cited: true` なら自社が引用されている（`cite_position` が順位）。
- `captcha: true` や `aio_present:false` が頻発するなら、ブロック/未描画。実行間隔やUULE地域指定の調整が必要。

## 次のステップ（この検証が通ったら）
- ロリポップ側に受け口 `ingest.php`（シークレット認証＋MySQL保存）と読み出し `aeo.php`（CORS付きJSON）を設置
- ワークフローを複数キーワード対応＋`schedule`で日次化、結果を `ingest.php` にPOST
- 順位モニター(drops.js)に AIO列・掲載率カレンダー・本文表示を実装

## 注意
- Google の自動アクセスは規約上グレー。実行頻度は控えめに、キーワード数は段階的に増やすこと。
- AIOのDOMは変わりやすい。抽出セレクタ（`crawl.mjs` の `aioSelectors`）は要メンテ。
