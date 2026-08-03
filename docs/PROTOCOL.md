# OSC Protocol v1

既定namespaceは`/pps`です。SETUPから変更できます。IDはProject内で自動発行され、削除後も再利用・再番号付けされません。

座標はすべて正規化されたfloatです。

- X: `0.0` = room left、`1.0` = room right
- Y: `0.0` = room front、`1.0` = room back
- Z: `0.0` = floor、`1.0` = ceiling

## Spatial Trigger

1回のStageタップにつき、次の3 messageを同じimmediate OSC Bundleとして送ります。

```text
/pps/spatial/S01/position  <x:float> <y:float> <z:float>
/pps/spatial/S01/gains     <SP01:float> <SP02:float> ...
/pps/spatial/S01/trigger   <eventSeq:int>
```

`gains`の並び順はProjectのspeaker配列順です。各Speakerの`out_ch`順ではありません。SETUP画面とExport JSONに表示される順序を使います。非空レイアウトでは定電力正規化され、`Σ gain² = 1`です。

Maxが独自に空間化する場合は`position`を利用し、`gains`を無視できます。このコントローラーのDBAPを使う場合は`gains`を各出力へ適用します。`trigger`を受け取ってから発音してください。

`eventSeq`はNode起動中に単調増加します。Projectの永続IDではなく、重複イベント検出用です。

## Spatial Move

Sourceマーカーのドラッグ中、またはZフェーダーの操作中は、描画フレーム単位に間引いて次のBundleを送ります。

```text
/pps/spatial/S01/position  <x:float> <y:float> <z:float>
/pps/spatial/S01/gains     <SP01:float> <SP02:float> ...
```

このBundleに`trigger`は含まれません。Max側では、既に鳴っている音源の空間ゲイン更新として扱えます。

## General Pad

```text
/pps/pad/P01/trigger <eventSeq:int>
```

Padは押下イベントだけを送り、releaseは送りません。発音内容と長さはMax側で決定します。

## General Fader

```text
/pps/fader/F01/value <value:float>
```

値域は`0.0–1.0`です。操作中は連続送信されます。

## UDPに関する注意

OSC出力はUDPで、受信確認はありません。画面の`OSC socket ready`はローカル送信socketが利用可能という意味であり、Maxが受信したことを保証しません。Spatialの3 messageは順序を保つため1 Bundleにまとめています。
