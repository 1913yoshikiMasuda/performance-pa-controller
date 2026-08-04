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
- General Controlsを複数ページに分けるタブ
- 新規General Controlを既存要素と重ならない空き領域へ自動配置
- OSC IDを維持したままPad/Faderへ日本語対応の表示名を設定
- Studio / Hype / Light / Ocean / Power / Liminal / Gorgeousテーマ切替
- Source IDごとの固定カラー（テーマ対応）
- 選択Sourceから各Speakerへのgainを線・リング・%で可視化
- Projectの自動保存、JSON Import / Export、最大5世代バックアップ
- 安定した自動ID（`SP01`, `S01`, `P01`, `F01`）。既存要素は再番号付けせず、削除で空いた最小番号を次の追加時に再利用します
- Spatialイベントを1つのOSC Bundleとして送信
- 選択Sourceと最後に触れたPad/FaderのOSCアドレス・現在値、現在のUDP送信先を画面内に表示
- Relative Linkによる複数Sourceの同時移動
- Scene A/Bへの全Source位置保存とMorph Fader

Cue、音声再生、Behavior、Automation、Group、Tag、Label、Web Audio Previewは意図的に含みません。

## 起動（初めての方向け・Mac）

このControllerは、Maxを動かすMac上で小さなWebサーバーを起動し、iPadからその画面を開いて使います。最初の1回だけNode.jsのインストールと準備が必要です。

ターミナルへ入力する文字は、以下の灰色のコード欄に書かれています。`$`などの記号を先頭に足す必要はありません。1行入力するごとにReturnキーを押してください。

### 1. Node.jsをインストールする

1. [Node.js公式ダウンロードページ](https://nodejs.org/en/download)をMacで開きます。
2. `LTS`と表示されたバージョンのmacOS用Installerをダウンロードします。`Current`ではなく`LTS`を推奨します。
3. ダウンロードした`.pkg`を開き、案内に沿ってインストールします。Node.jsと一緒に`npm`もインストールされます。
4. Finderで`アプリケーション`→`ユーティリティ`→`ターミナル`を開きます。
5. 次の2行を1行ずつ実行します。

```bash
node -v
npm -v
```

それぞれ`v24...`や`11...`のような数字が表示されれば準備完了です。`command not found`と表示された場合は、ターミナルをいったん終了して開き直してください。それでも表示されなければNode.jsを再インストールします。

### 2. Controllerをダウンロードする

Gitを使ったことがない場合は、ZIPでのダウンロードが簡単です。

1. [このリポジトリのGitHubページ](https://github.com/1913yoshikiMasuda/performance-pa-controller)を開きます。
2. 緑色の`Code`ボタンを押し、`Download ZIP`を選びます。
3. ダウンロードしたZIPをダブルクリックして展開します。
4. 展開された`performance-pa-controller...`フォルダを、書類フォルダなど消さない場所へ移します。

### 3. ターミナルでControllerのフォルダを開く

1. ターミナルへ`cd`と入力し、その後ろに半角スペースを1つ入れます。まだReturnは押しません。
2. Finderから、先ほど展開した`performance-pa-controller...`フォルダをターミナルのウインドウへドラッグ＆ドロップします。フォルダの場所が自動入力されます。
3. Returnを押します。

入力結果は次のような形になります。実際の名前や場所は異なっていて構いません。

```bash
cd /Users/your-name/Documents/performance-pa-controller-main
```

念のため、次を実行します。

```bash
ls
```

一覧の中に`package.json`、`README.md`、`src`、`web`などが表示されれば、正しいフォルダを開けています。

### 4. 必要なパッケージを準備する（初回のみ）

次を実行します。

```bash
npm install
```

必要なプログラムがインターネットからダウンロードされ、同じフォルダ内の`node_modules`へ入ります。少し時間がかかる場合があります。`npm WARN`という警告だけなら、通常はそのまま進められます。赤字の`npm ERR!`で終了した場合は、エラーメッセージを確認してください。

### 5. Controllerを起動する

次を実行します。

```bash
npm start
```

次のように表示されたら起動成功です。

```text
[controller] http://localhost:8080
[osc] 127.0.0.1:7400/pps
```

macOSから「着信接続を許可しますか？」と確認された場合は、同じWi-FiのiPadから接続できるよう`許可`を選びます。Controllerを使っている間は、このターミナルを閉じないでください。

### 6. Macで画面を確認する

MacのChromeまたはSafariで次のアドレスを開きます。

```text
http://localhost:8080
```

Controllerの画面が表示されれば、Webサーバーは正常に動いています。

### 7. iPadから接続する

MacとiPadを同じWi-Fiへ接続します。次にMacの`システム設定`→`Wi-Fi`→接続中ネットワークの`詳細`を開き、MacのIPアドレスを確認します。たとえばIPアドレスが`192.168.1.20`なら、iPadのChromeで次を開きます。

```text
http://192.168.1.20:8080
```

`192.168.1.20`の部分は、実際に表示されたMacのIPアドレスへ置き換えてください。`https`ではなく`http`です。

iPadではChromeのアドレスバー右側にある共有メニューから`ホーム画面に追加`を選べます。追加された`Performance PA`アイコンから起動すると、アドレスバーやブラウザ操作列のない表示になります。通常のChromeタブ内で開いている間は、Web側からアドレスバーを恒久的に消すことはできません。

### 8. MaxへのOSC送信先を確認する

MaxとControllerのNodeサーバーを同じMacで動かす場合、SETUPのOSC送信先は通常、次のままで構いません。

```text
Host: 127.0.0.1
Port: 7400
Namespace: /pps
```

iPadはMacのIPアドレスへ画面を見に行きますが、OSCはMac上のNodeからMaxへ送られます。そのため、同じMac上のMaxへ送る場合のOSC Hostは`127.0.0.1`です。Maxを別のコンピューターで動かす場合だけ、そのコンピューターのIPアドレスを指定します。

### 終了する

Controllerを動かしているターミナルを選び、Controlキーを押しながら`C`を1回押します。

```text
Control + C
```

ターミナルに`^C`と表示されて入力待ちへ戻れば終了しています。ブラウザの画面を閉じるだけではNodeサーバーは終了しません。

### 2回目以降の起動

Node.jsの再インストールと`npm install`は通常不要です。ターミナルを開き、手順3と同じ方法でControllerのフォルダへ移動してから、次だけを実行します。

```bash
npm start
```

Controllerを新しいバージョンへ入れ替えた場合は、起動前にもう一度`npm install`を実行してください。

### うまく接続できない場合

- Macでも画面が開かない：ターミナルに`[controller] http://localhost:8080`と表示されているか確認します。
- iPadだけ開かない：MacとiPadが同じWi-Fiか、URLのIPアドレスが現在のMacのものか、macOSのファイアウォールで接続を許可したか確認します。
- 会場やホテルのWi-Fiで開かない：同じWi-Fi内の機器同士を遮断する設定の場合があります。専用ルーターやMacのインターネット共有を使用してください。
- `EADDRINUSE`と表示される：すでに別のControllerが起動している可能性があります。以前使ったターミナルを探してControl + Cで終了します。
- `npm: command not found`と表示される：Node.jsが正しくインストールされていません。手順1から確認します。
- `npm ERR!`で止まる：インターネット接続を確認し、Controllerのフォルダ内で`npm install`をもう一度実行します。

開発者向けには次も利用できます。

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

- Padは枠内で指を離した時だけ、trigger gateの`1`→`0`を送って発火します。触れたまま枠外へ指を逃がして離すとキャンセルされ、OSCは送られません。
- Switchも枠内で指を離した時だけ`1 / 0`を切り替え、ON/OFF表示を更新します。枠外で離した操作はキャンセルされます。OSCアドレスは通常Padと同じ形式です。
- Faderは操作中の値を`0.0–1.0`で送ります。
- FaderのControl内側は、横方向を含めて全面がタッチ領域です。
- Faderは触れた位置へ値をジャンプさせず、現在値を基準にした相対ドラッグです。最初の6pxはデッドゾーンになっています。
- EDITにするとPad、Switch、Faderの追加、削除、ドラッグ配置ができます。
- General Controls上部のタブでページを切り替えます。EDIT中は右端の`＋ / ✎ / ×`でページの追加、名称変更、空ページの削除ができます。ページ名は日本語にも対応します。
- 追加時は空き領域を左上から探索し、既存Controlと重ならない位置へ配置します。空きがない場合は重ねずに追加を中止します。
- Padは最小幅で縦に約2段置ける高さ、Switchは最小幅の縦長サイズで追加されます。
- EDIT中は右下のリサイズハンドルで幅と高さを変更できます。
- EDIT中にControl左上の`✎`を押すと、OSC IDを変更せずに表示名を設定・Clearできます。日本語や絵文字も入力できます。
- LIVEに戻すと配置操作を受け付けません。

ヘッダーの`THEME`でStudio / Hype / Light / Ocean / Power / Liminal / Gorgeousを選択できます。テーマはそのブラウザに保存され、ProjectのOSC設定やレイアウトには影響しません。

## Projectデータ

通常は`projects/_active.json`へ自動保存され、Gitには含まれません。ProjectにはOSC設定、部屋、スピーカー、Spatial Source、Scene A/B、General Controlのページ、Pad/Faderと配置だけが保存されます。音声ファイルへのパスは保存しません。旧形式のProject JSONにページ情報がない場合は、読み込み時に全Controlを`MAIN`ページへ自動移行します。

メイン画面のProject名右側にある`IMPORT / EXPORT`から、SETUPを開かずにProject JSONを読み込み・書き出しできます。SETUP内の`IMPORT JSON / EXPORT JSON`も同じ操作です。通常の作業状態は別途自動保存されます。

IDは追加のたびに実際の空きを確認します。たとえば`P01, P02, P03`から`P02`を削除すると、既存の`P01, P03`はそのままで、次のPadまたはSwitchが`P02`になります。Max側で削除済みIDのアサインを残している場合は、新しい要素が同じOSCアドレスを使う点に注意してください。

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
