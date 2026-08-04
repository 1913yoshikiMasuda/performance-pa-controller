# Performance PA Controller

Maxを使う現場PAのための、音声エンジンを持たない3D空間定位・ポン出しOSCコントローラーです。
iPadなどのブラウザから操作し、発音、サンプル選択、エンベロープ、DSP、Audio I/OはMax側で自由に実装します。

## 機能

- 最大64台の3Dスピーカーレイアウト（X/Y/Z、論理出力ch）
- 3D DBAPによる定電力ゲイン計算（距離範囲外のSpeakerを除外可能）
- 2D / 3Dビュー切替、3Dオービット、ピンチ/ホイールズーム
- ISO / FRONT / SIDE / TOPの3Dアングルプリセット
- Spatial Sourceを選択し、Stageをタップして定位＋発火
- 室内を押した瞬間にtrigger gateを開き、そのままドラッグして連続定位
- 任意数の通常Padと、`0.0–1.0`に正規化されたFader
- タップごとに`1 / 0`を切り替えるSwitch型Pad
- EDITモードでPad/Faderを自由配置、LIVEモードで構造編集をロック
- EDITモードでPad/Faderの幅と高さをリサイズ
- OSC IDを維持したままPad/Faderへ日本語対応の表示名を設定
- Studio / グリーンユートピアのHype / Light / Ocean / Power / Liminal / Gorgeousテーマ切替
- Source IDごとの固定カラー（テーマ対応）
- 選択Sourceから各Speakerへのgainを線・リング・%で可視化
- Projectの自動保存、JSON Import / Export、最大5世代バックアップ
- 安定した自動ID（`SP01`, `S01`, `P01`, `F01`）。削除しても自動では再番号付け・再利用しません
- Spatialイベントを1つのOSC Bundleとして送信
- 選択Sourceと最後に触れたPad/FaderのOSCアドレス・現在値、現在のUDP送信先を画面内に表示
- Relative Linkによる複数Sourceの同時移動
- Scene A/Bへの全Source位置保存とMorph Fader

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

Sourceは色付き円と`SRC · S01`、Speakerは菱形と`SP · SP01`で表示されます。選択Sourceの各SpeakerへのDBAP gainは接続線の太さで、定電力配分（`gain²`）はSpeaker周囲のリング・数値%で確認できます。%は全Speakerで合計100%になります。この表示値はOSCへ送るNode側のgain計算結果から算出されます。

Stage左上で2D / 3Dを切り替えられます。どちらもProjectで設定した部屋の実寸比を維持し、2DはWidth × Depthの上面投影です。室内面に触れた瞬間に選択Sourceが移動して`trigger 1`を送り、指をつけたままドラッグするとposition/gainsが連続更新され、指を離すと`trigger 0`を送ります。2Dの室外タップは無視され、3Dの室外ドラッグは視点回転になります。Zフェーダーはgateを変えずに定位だけを更新します。ピンチまたはマウスホイールでズームし、ISO / FRONT / SIDE / TOPで視点を即座に切り替えられます。

Advanced DBAPの`Range metres`を設定すると、Sourceからその距離を超えたSpeakerのgainは`0`になります。境界で急に切れないよう、Rangeの外周25%ではSmoothstepカーブで連続的に減衰します。残ったSpeaker間で定電力に再正規化され、全Speakerが範囲外の場合は最近傍1台へフォールバックします。`0`は範囲制限なしです。

`Hard center metres`を設定すると、SourceのXY位置がSpeakerからその半径内に入った場合、Zの差にかかわらず最近傍Speakerだけをgain `1`、他を`0`にします。その外側には同じ幅のSmoothstepクロスフェード領域があり、通常のDBAPへ連続的に戻ります。たとえば0.3mなら0〜0.3mが完全なハードセンター、0.3〜0.6mが遷移範囲です。遷移中も定電力に再正規化されます。`0`で無効です。

`LINK`を押してSourceを複数選び、`DONE`で確定すると、リンク対象のどれを選んで操作しても相対距離を保ったまま一緒に移動します。いずれかが部屋の端に達するとグループ全体が止まるため、配置関係は崩れません。LINK選択はブラウザの操作状態で、Projectには保存されません。

`SET A`と`SET B`は、その時点の全Source位置をSceneとしてProjectへ保存します。両方を保存すると`MORPH`が有効になり、Scene A/Bの間を連続補間します。保存済みの`SET A ✓`または`SET B ✓`を長押しすると確認後に個別Clearできます。Scene保存後に追加されたSourceなど、片方のSceneにしか存在しないSourceはMorph対象外です。

### General Controls

- Padは押している間だけtrigger gateが`1`になり、離すと`0`になります。
- Switchはタップすると`1`、もう一度タップすると`0`を送り、ON/OFF表示も切り替わります。OSCアドレスは通常Padと同じ形式です。
- Faderは操作中の値を`0.0–1.0`で送ります。
- FaderのControl内側は、横方向を含めて全面がタッチ領域です。
- Faderは触れた位置へ値をジャンプさせず、現在値を基準にした相対ドラッグです。最初の6pxはデッドゾーンになっています。
- EDITにするとPad、Switch、Faderの追加、削除、ドラッグ配置ができます。
- EDIT中は右下のリサイズハンドルで幅と高さを変更できます。
- EDIT中にControl左上の`✎`を押すと、OSC IDを変更せずに表示名を設定・Clearできます。日本語や絵文字も入力できます。
- LIVEに戻すと配置操作を受け付けません。

ヘッダーの`THEME`でStudio / Hype / Light / Ocean / Power / Liminal / Gorgeousを選択できます。テーマはそのブラウザに保存され、ProjectのOSC設定やレイアウトには影響しません。

## Projectデータ

通常は`projects/_active.json`へ自動保存され、Gitには含まれません。ProjectにはOSC設定、部屋、スピーカー、Spatial Source、Scene A/B、Pad/Faderと配置だけが保存されます。音声ファイルへのパスは保存しません。

メイン画面のProject名右側にある`IMPORT / EXPORT`から、SETUPを開かずにProject JSONを読み込み・書き出しできます。SETUP内の`IMPORT JSON / EXPORT JSON`も同じ操作です。通常の作業状態は別途自動保存されます。

SETUP最下部の`RESET ID COUNTERS`は、既存要素のIDを変更せず、次回追加時から各種IDの空いている最小番号を再利用可能にします。Max側のOSCアサインと異なる要素へ同じアドレスが再利用される可能性があるため、確認後にのみ実行されます。

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

OSS公開準備については[`docs/OPEN_SOURCE_RELEASE_CHECKLIST.md`](docs/OPEN_SOURCE_RELEASE_CHECKLIST.md)を参照してください。
