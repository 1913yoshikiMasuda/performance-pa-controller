# OSS公開チェックリスト

Performance PA ControllerをGitHubで公開する前後に確認する項目をまとめます。
すべてを完了しないと公開できないわけではありません。まず安全に利用できる最小構成で公開し、コミュニティ向けの整備は公開後に進めることもできます。

## 現在できていること

- [x] MIT Licenseを配置
- [x] READMEに概要、起動方法、操作方法を記載
- [x] OSC Protocolを`docs/PROTOCOL.md`に記載
- [x] Max受信サンプルを同梱
- [x] `projects/_active.json`と自動バックアップをGit対象外に設定
- [x] DBAP、Projectパース、OSCの自動テストを用意
- [x] TypeScript型チェックとWeb JavaScript構文チェックを用意
- [x] `package-lock.json`を追跡

## 今すぐ公開する場合の最低条件

### 1. セキュリティ境界

- [ ] WebSocket接続時にOriginを検証する
- [ ] READMEに「信頼できるLAN内でのみ使用し、インターネットへ直接公開しない」と明記する
- [ ] OSC host、port、namespaceの入力制限を再確認する
- [ ] 不正なWebSocketメッセージ、大きすぎるProject import、接続切断時のgate解放を確認する
- [ ] Git履歴をsecret scannerで確認する

現状はiPadから使えるようHTTPサーバーを`0.0.0.0`で待ち受けます。認証を持たないため、公開版ではネットワーク上の信頼境界を明確にします。将来的にはペアリングトークンの導入も検討します。

### 2. インストールと起動

- [ ] `npm start`に必要な`tsx`を`dependencies`へ移す、またはビルド済みJavaScriptから起動する
- [ ] 新しいディレクトリで`git clone`相当の状態から`npm ci && npm start`を確認する
- [ ] README記載どおりNode.js 20以降で起動できることを確認する
- [ ] macOSとiPadの実機で、接続、ドラッグ、複数タッチ、終了処理をスモークテストする

### 3. 自動チェック

- [ ] `.github/workflows/ci.yml`を追加する
- [ ] CIで`npm ci`と`npm run check`を実行する
- [ ] サポート対象のNode.jsバージョンでテストする
- [ ] mainブランチへの変更でCI成功を必須にする

### 4. 公開する変更の整理

- [ ] `git status`で意図しないファイルが含まれていないことを確認する
- [ ] 今回のDBAP、Canvas、終了処理などの変更を意図的な単位でコミットする
- [ ] `origin/main`との差分をレビューする
- [ ] `npm audit`を実行する
- [ ] `npm run check`を実行する
- [ ] `v0.1.0`タグとGitHub Release用のリリースノートを準備する

## もう少し品質を調整してから公開する場合

### 利用者向けドキュメント

- [ ] README冒頭にUIのスクリーンショットまたは短いGIFを追加する
- [ ] 英語の概要とQuick Startを追加する
- [ ] Node.js、macOS、iPadOS、Maxの確認済みバージョン表を追加する
- [ ] トラブルシューティングを追加する
- [ ] OSCを受信して音を出す最小Maxパッチ例を充実させる
- [ ] DBAPの`Rolloff`、`Blur`、`Range`、`Hard center`の設定例を追加する
- [ ] 音量を下げて試すこと、リミッターと信号平滑化はMax側の責務であることを明記する

### 操作と回帰テスト

- [ ] iPad Safariを対象にしたブラウザE2Eテストを検討する
- [ ] PROJECT SETUPの2D/3Dスピーカードラッグを長時間テストする
- [ ] 複数Source、複数Pad、複数Faderの同時操作を確認する
- [ ] WebSocket再接続時にProjectとgate状態が正しく復元・解放されることを確認する
- [ ] OSC受信側が停止している場合もWeb UIが操作可能であることを確認する
- [ ] Project JSONの旧バージョン互換方針を決める

### Contributor向け

- [ ] `CONTRIBUTING.md`を追加する
- [ ] `SECURITY.md`へ脆弱性の非公開報告方法を書く
- [ ] `CODE_OF_CONDUCT.md`を採用するか判断する
- [ ] Bug reportとFeature requestのIssue templateを追加する
- [ ] Pull request templateを追加する
- [ ] `CHANGELOG.md`を追加する
- [ ] 将来の機能範囲をRoadmapまたはIssuesで示す

### package.json

- [ ] `license`を追加する
- [ ] `author`を追加する
- [ ] `repository`を追加する
- [ ] `bugs`を追加する
- [ ] `homepage`を追加する
- [ ] `engines.node`を追加する
- [ ] npmへ公開しないアプリとして`private: true`を維持する

## GitHubでPublicへ変更するとき

- [ ] Repository descriptionとTopicsを設定する
- [ ] Social preview画像を設定する
- [ ] Issuesを有効にする
- [ ] Dependabot alertsとsecurity updatesを有効にする
- [ ] Secret scanningとpush protectionを有効にする
- [ ] Private vulnerability reportingを有効にするか判断する
- [ ] mainのbranch protectionまたはrulesetを設定する
- [ ] Merge方式を決める（Squash merge推奨）
- [ ] 公開直後に別ブラウザまたはログアウト状態でREADME、Clone、起動手順を確認する

推奨Topics:

```text
max-msp osc spatial-audio dbap ipad live-sound typescript
```

## 公開判断の目安

### 早めに公開してよい状態

- セキュリティ境界を明記・実装できている
- clone後の起動手順が再現できる
- CIが通る
- 実機で主要操作が成立する
- 既知の制約をREADMEに書いている

### 品質調整を優先した方がよい状態

- LAN外からアクセスできる可能性を説明できていない
- production installで起動できない
- Canvasやマルチタッチに再現性の低い不具合が残っている
- Max側の最小音出し例がなく、初見利用者が接続を再現しづらい
- 対応環境と既知の制約が不明確

## リリース直前コマンド

```bash
npm ci
npm audit
npm run check
git status --short
git diff --check
```

これらが成功し、意図した変更だけがコミットされていることを確認してからPublic化・タグ作成を行います。
