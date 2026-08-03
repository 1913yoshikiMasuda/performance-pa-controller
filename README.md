# Performance PA Controller

Maxを使う現場PAのための、音声エンジンを持たない3D空間定位・ポン出しOSCコントローラーです。
iPadなどのブラウザから操作し、発音、サンプル選択、エンベロープ、DSP、Audio I/OはMax側で自由に実装します。

## 機能

- 3Dスピーカーレイアウト（X/Y/Z、出力ch）
- 3D DBAPによる定電力ゲイン計算
- 2D / 3Dビュー切替、3Dオービット、ピンチ/ホイールズーム
- ISO / FRONT / SIDE / TOPの3Dアングルプリセット
- Spatial Sourceを選択し、Stageをタップして定位＋発火
- 室内を押した瞬間にtrigger gateを開き、そのままドラッグして連続定位
- 任意数の通常Padと、`0.0–1.0`に正規化されたFader
- EDITモードでPad/Faderを自由配置、LIVEモードで構造編集をロック
- EDITモードでPad/Faderの幅と高さをリサイズ
- 低彩度のStudio / シアン・マゼンタのHypeテーマ切替
- Source IDごとの固定カラー（テーマ対応）
- 選択Sourceから各Speakerへのgainを線・リング・%で可視化
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
3. Stageの室内面に指を置き、そのまま必要な位置までドラッグします。

発火後もSourceは選択されたままです。別の音を使う場合はSource IDを1回タップして切り替えます。

Sourceは色付き円と`SRC · S01`、Speakerは菱形と`SP · SP01`で表示されます。選択Sourceの各SpeakerへのDBAP gainは、接続線の太さ・Speaker周囲のリング・数値%で確認できます。この表示値はWeb側の再計算ではなく、OSCへ送るNode側のgain計算結果です。

Stage左上で2D / 3Dを切り替えられます。室内面に触れた瞬間に選択Sourceが移動して`trigger 1`を送り、指をつけたままドラッグするとposition/gainsが連続更新され、指を離すと`trigger 0`を送ります。2Dの室外タップは無視され、3Dの室外ドラッグは視点回転になります。Zフェーダーはgateを変えずに定位だけを更新します。ピンチまたはマウスホイールでズームし、ISO / FRONT / SIDE / TOPで視点を即座に切り替えられます。

### General Controls

- Padは押している間だけtrigger gateが`1`になり、離すと`0`になります。
- Faderは操作中の値を`0.0–1.0`で送ります。
- Faderのオレンジ色の内側は、横方向を含めてスライダーのタッチ領域です。
- EDITにすると追加、削除、ドラッグ配置ができます。
- EDIT中は右下のリサイズハンドルで幅と高さを変更できます。
- LIVEに戻すと配置操作を受け付けません。

ヘッダーの`THEME`でStudio / Hypeを切り替えられます。テーマはそのブラウザに保存され、ProjectのOSC設定やレイアウトには影響しません。

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
