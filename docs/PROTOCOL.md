# OSC Protocol v1

既定namespaceは`/pps`です。SETUPから変更できます。IDはProject内で自動発行され、削除後も再利用・再番号付けされません。

座標はすべて正規化されたfloatです。

- X: `0.0` = room left、`1.0` = room right
- Y: `0.0` = room front、`1.0` = room back
- Z: `0.0` = floor、`1.0` = ceiling

## Speaker Configuration

Speakerは最大64台です。Node起動時、Project import時、Speakerの追加・変更・削除時に、次のimmediate OSC Bundleを送ります。Spatial Trigger Bundleにも同じ3 messageを先頭へ含めるため、MaxをNodeより後に起動した場合も最初の発音時に同期できます。

```text
/pps/speakers/count    <count:int>
/pps/speakers/outputs  <SP01-out:int> <SP02-out:int> ...
/pps/speakers/ids      <SP01-id:string> <SP02-id:string> ...
```

`outputs`と`ids`の並び順はProjectのspeaker配列順で、`gains`と一対一に対応します。`out_ch`はMaxの論理出力チャンネル`1–1024`です。64ch固定のMCパッチでは、受信したgainリストを必ず64要素まで`0`で埋めてください。短いリストをそのまま既存のMC値へ適用すると、削除されたSpeakerの古いgainが残る可能性があります。

## Spatial Trigger

Stageの室内面に指が触れた瞬間、Speaker Configurationの3 messageと次の3 messageを同じimmediate OSC Bundleとして送ります。

```text
/pps/spatial/S01/position  <x:float> <y:float> <z:float>
/pps/spatial/S01/gains     <SP01:float> <SP02:float> ...
/pps/spatial/S01/trigger   1
```

`gains`の並び順はProjectのspeaker配列順です。各Speakerの`out_ch`順ではありません。SETUP画面とExport JSONに表示される順序を使います。非空レイアウトでは定電力正規化され、`Σ gain² = 1`です。

Maxが独自に空間化する場合は`position`を利用し、`gains`を無視できます。このコントローラーのDBAPを使う場合は`gains`を各出力へ適用します。`trigger 1`を受け取ってから発音してください。

指を離すかブラウザのpointerがキャンセルされたとき、次を単独messageとして送ります。

```text
/pps/spatial/S01/trigger   0
```

したがって`trigger`はイベント番号ではなくgateです。`1`の間を押下中、`0`を解放としてMax側で解釈できます。ブラウザ接続が切れた場合も、Nodeが保持中のgateへ`0`を送ります。

## Spatial Move

Stageを押したままのドラッグ中、またはZフェーダーの操作中は、描画フレーム単位に間引いて次のBundleを送ります。

```text
/pps/spatial/S01/position  <x:float> <y:float> <z:float>
/pps/spatial/S01/gains     <SP01:float> <SP02:float> ...
```

このBundleに`trigger`は含まれません。Max側では、既に鳴っている音源の空間ゲイン更新として扱えます。

Relative LinkまたはScene Morphで複数Sourceが同時に動く場合もアドレス形式は変わりません。対象Sourceごとの`position`と`gains`を、描画フレームごとに1つのimmediate OSC Bundleへまとめて送ります。Relative Linkの押下時はSpeaker Configurationを先頭に1回だけ含め、その後に各Sourceの`position`、`gains`、`trigger 1`が続きます。解放時の`trigger 0`も対象Source分を1つのBundleへまとめます。

## General Pad

```text
/pps/pad/P01/trigger 1
/pps/pad/P01/trigger 0
```

Padはtouch-up-insideで確定するtriggerです。枠内で指を離した時だけ`1`と`0`を順番に送り、触れたまま枠外へ指を逃がして離した場合やpointerがキャンセルされた場合は何も送りません。発音内容はMax側で決定します。

EDITから追加できるSwitch型Padも同じ`/pad/<ID>/trigger`を使います。Switchは枠内で指を離した操作ごとに`1`と`0`を切り替え、枠外で離した操作はキャンセルします。ブラウザが切断してもNodeが動作している間は状態を維持します。複数ブラウザ間ではON/OFF状態が同期されます。Switchの削除、Project import、Node終了時には、ONだったSwitchへ`0`を送ってから状態を破棄します。Node再起動後の初期状態はOFFです。

## General Fader

```text
/pps/fader/F01/value <value:float>
```

値域は`0.0–1.0`です。操作中は連続送信されます。

## Health heartbeat

Web UIが接続されている間、Nodeは約2秒ごとにOSC heartbeatを送ります。第2引数はNodeがpongを待ち受ける動的UDPポートです。

```text
/pps/system/ping <sequence:int> <replyPort:int>
```

OSC受信側はsequenceを変えず、同じnamespaceの次のmessageをNodeのホストと`replyPort`へ返してください。

```text
/pps/system/pong <sequence:int>
```

付属Maxパッチは`127.0.0.1`上のNodeへ自動応答します。Maxを別マシンで動かす場合は、パッチ内の`udpsend 127.0.0.1 ...`のホストをNodeが動くマシンのIPアドレスへ変更してください。Web UIはWebSocketとOSCを個別に往復計測し、OSC pongが約6秒途絶えると警告します。

## UDPに関する注意

通常の操作OSCはUDPで個別の受信確認を行いませんが、heartbeatのpongによって同じ送受信経路を常時監視します。Spatialの3 messageは順序を保つため1 Bundleにまとめています。
