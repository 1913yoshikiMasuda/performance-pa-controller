# Max receiver

`performance-pa-controller.maxpat`はOSC疎通確認用の最小パッチです。

このパッチは`/pps/system/ping <sequence> <replyPort>`を受けると、`/pps/system/pong <sequence>`をNodeへ返します。これによりWeb UIのヘッダーへWebSocketとOSCそれぞれの往復レイテンシーが表示されます。MaxとNodeを別のマシンで動かす場合は、パッチ内の`udpsend 127.0.0.1 7401`の`127.0.0.1`をNodeマシンのIPアドレスへ変更してください。ポート番号はpingごとに自動設定されます。

```text
[udpreceive 7400]
      |
  [oscparse]
      |
  [list trim]
      |
  [print pps]
```

Max Consoleには例えば次のlistが表示されます。

```text
pps spatial S01 position 0.5 0.5 0.5
pps spatial S01 gains 0.5 0.5 0.5 0.5
pps spatial S01 trigger 1
pps spatial S01 trigger 0
pps pad P01 trigger 1
pps pad P01 trigger 0
pps fader F01 value 0.75
```

実際の利用では`route pps`、`route speakers spatial pad fader`、`route S01 S02 ...`を組み合わせます。`speakers/outputs`はgainと同じSpeaker配列順の論理出力チャンネルです。OSC Bundle内の`position`と`gains`を保存し、`trigger 1`でgateを開き、`trigger 0`で閉じる構成を推奨します。64ch固定のMC処理へ渡す場合、gainリストの末尾を必ず`0`で埋めてください。

SourceドラッグとZフェーダーから届くBundleには`position`と`gains`だけが含まれ、`trigger`はありません。既に鳴っている音源のゲイン更新として利用できます。
