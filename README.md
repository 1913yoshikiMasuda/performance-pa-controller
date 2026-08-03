# Performance PA Controller

Maxを使う現場PAのための、音声エンジンを持たない3D空間定位・ポン出しOSCコントローラーです。
iPadなどのブラウザから操作し、発音、サンプル選択、エンベロープ、DSP、Audio I/OはMax側で自由に実装します。

## 機能

- 3Dスピーカーレイアウト（X/Y/Z、出力ch）
- 3D DBAPによる定電力ゲイン計算
- Spatial Sourceを選択し、Stageをタップして定位＋発火
- 任意数の通常Padと、`0.0–1.0`に正規化されたFader
- EDITモードでPad/Faderを自由配置、LIVEモードで構造編集をロック
- Projectの自動保存、JSON Import / Export、最大5世代バックアップ
- 安定した自動ID（`SP01`, `S01`, `P01`, `F01`）。削除しても再番号付けしません
- Spatialイベントを1つのOSC Bundleとして送信

Cue、音声再生、Behavior、Automation、Group、Tag、Label、Web Audio Previewは意図的に含みません。

## 起動

Node.js 20以降が必要です。

```bash
npm install
npm start
```

Macでは `http://localhost:8080`、同じネットワークのiPadでは `http://<MacのIP>:8080` を開きます。
SETUPでOSC送信先をMaxが動いているMacのIP、portを`7400`に設定してください。

開発時は次も利用できます。

```bash
npm run dev
npm run check
```

## 最短のMax接続

同梱の [`max/performance-pa-controller.maxpat`](max/performance-pa-controller.maxpat) を開きます。受信したOSCはMax Consoleへ表示されます。
実際のパッチでは `route spatial pad fader` と各IDを使って処理を分岐してください。

既定のOSC namespaceとportは以下です。

```text
/pps
7400/UDP
```

詳細は [`docs/PROTOCOL.md`](docs/PROTOCOL.md) を参照してください。

## 操作

### Spatial

1. 左の`S01`などを選択します。
2. 右のZフェーダーで高さを指定します。
3. 3D Stage上の場所をタップします。

発火後もSourceは選択されたままです。別の音を使う場合はSource IDを1回タップして切り替えます。

### General Controls

- Padはタップごとにtriggerイベントを送ります。
- Faderは操作中の値を`0.0–1.0`で送ります。
- EDITにすると追加、削除、ドラッグ配置ができます。
- LIVEに戻すと配置操作を受け付けません。

## Projectデータ

通常は`projects/_active.json`へ自動保存され、Gitには含まれません。ProjectにはOSC設定、部屋、スピーカー、Spatial Source、Pad/Faderと配置だけが保存されます。音声ファイルへのパスは保存しません。

## 設計境界

```text
[iPad Web UI] --WebSocket--> [Node state + 3D DBAP] --OSC/UDP--> [Max] --> Speakers
```

ブラウザとNodeは操作意図・Project・空間ゲインだけを扱います。音の生成、再生タイミング、信号平滑化、リミッター、Audio DeviceはMax側の責務です。Nodeやブラウザが停止しても、Maxへ暗黙のstopやmuteは送りません。

## Environment variables

- `HTTP_PORT`: Web UI port。既定`8080`
- `PROJECT_FILE`: active Project保存先。既定`projects/_active.json`

## License

MIT
