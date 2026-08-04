# Future Scope Note: Cue Workspace

> Status: exploration only
>
> この文書は将来構想を忘れないための設計メモです。現在の公開機能、v0.1のリリース条件、確定Roadmap、実装予定の約束ではありません。

## 現行プロダクトで守るもの

現在のPerformance PA Controllerは、iPadから身体的・直感的に操作するライブ用Performance Surfaceとして扱います。

- 空間上の位置を直接タップする
- Sourceを選び、その場でtriggerを送る
- ドラッグで連続的に定位する
- Relative Linkと簡易A/B Morphをライブ操作として使う
- Max側の音声設計を拘束しない

Scene管理、Cue構築、時間軸編集を現在の画面へ追加し続けないことを基本方針とします。簡易A/B MorphはCueシステムの入口ではなく、Performance Surface内で完結する軽量機能として残します。

## 将来分離したいワークスペース

将来的にCueやAutomationを扱う場合は、現在のUIを拡張するのではなく、目的の異なるワークスペースとして分離します。

```text
PERFORM  iPad向けの現在のライブ操作面
CUES     PC・横画面向けのCue構築と時間編集
SETUP    Room、Speaker、OSC、Project設定
```

見た目と操作体系は別アプリに近くても、Project、Source ID、Scene、Speaker構成、Node状態、OSC設定は共有できる構造を想定します。

## Cue WorkspaceのUI仮説

CUESは、Cue Listと表計算UIの一覧性に、Spatial PreviewとInspectorを組み合わせます。純粋な表だけでは空間位置や軌道を直感的に編集しづらいため、表だけで完結させません。

```text
┌──────────── Cue Table ────────────┬──── Spatial Preview ────┐
│ #  Name  Source  Action  Time ... │ point / scene / path    │
│ 1  Entry S01     Move+Play 4.0s   │                         │
│ 2  Cross S01     Move      8.0s   │                         │
├───────────────────────────────────┴─────────────────────────┤
│ Inspector: trigger / curve / fade / follow / override       │
└─────────────────────────────────────────────────────────────┘
```

表で比較・複製・並べ替えを行い、空間プレビューでDestinationやPathを編集し、詳細条件はInspectorで設定する構成を候補とします。

### 表で扱う候補

| Field | 内容 |
|---|---|
| Cue | 安定したID、番号、名前、有効／無効 |
| Source | 対象SourceまたはSource Group |
| Action | Move / Trigger / Move + Trigger / Release |
| Destination | Current / Point / Scene |
| Trigger timing | Start / Arrival / None |
| Movement | Duration、Curve、Path |
| Level | Fade In、Hold、Fade Out |
| Sequence | Manual GO、Wait、Auto-follow |

## Cueの意味モデル

最低限、次の指定を独立して扱える必要があります。

- 空間のどこをDestinationにするか
- 移動だけか、発音triggerも送るか
- triggerを移動開始時と到着時のどちらで送るか
- 瞬間移動か、時間をかけたMovementか
- Movementの秒数と補間Curve
- Source levelのFade In / Fade Outと各秒数
- Cue終了後に停止するか、次のCueへ進むか

SceneはCueそのものではなく、複数Cueから再利用できるDestinationとして位置づけます。CueはPointを直接保持することもSceneを参照することもできます。

## Spatial gainと音量Fadeの分離

DBAPによるSpeaker配分と、Source全体の音量Envelopeを混同しません。

```text
final speaker level = DBAP speaker gain × source level envelope
```

- NodeはSource位置とDBAP gainを管理する
- Cue EngineはMovement、trigger、levelの意図を管理する
- Maxは信号平滑化、Fade、発音、停止、DSPを担当する

Fadeを実装する場合も、WebやNodeが音声信号を持つ設計にはしません。

## 実用化時に必要な振る舞い

### Automation transport

- DurationとCurve
- Start / Pause / Resume / Cancel
- Reverse、Loop、Ping-pong
- Manual GO、Wait、Auto-follow
- 実行中Cueと進捗の可視化

### Manual override

Automationと手操作が同じSourceを書き換えて競合しないよう、Sourceごとに所有状態を持たせます。

```text
MANUAL
AUTOMATION
TOUCH_OVERRIDE
RETURNING
```

Automation中にSourceへ触れた場合、そのSourceだけを一時的に手動操作へ移し、指を離した後に指定時間でAutomation軌道へ復帰できる設計を候補とします。

### Max連携

MaxからCueやAutomationを開始でき、Web側でも同じ実行状態を確認できる双方向状態同期を検討します。

```text
/pps/automation/start <from> <to> <seconds> <curve>
/pps/automation/pause
/pps/automation/resume
/pps/automation/cancel
/pps/scene/recall <scene>
```

上記はアドレス案であり、現行OSC Protocolには含めません。

### 性能と信頼性

64 Source × 64 Speakerの連続AutomationではUDP packetが大きくなるため、実装前に通信設計を検証します。

- 動いているSourceだけ更新する
- 更新レートを制御する
- 大きなBundleを安全な単位へ分割する
- frame ID、automation ID、sequenceを検討する
- Max側で最後の正常値を保持し、短いgain rampを適用する
- 長時間運転、再接続、Cancel、途中Cue変更をテストする

## 段階的に検討する場合

1. A/BにDuration、Curve、Start、Cancelを加えたAutomation Engine
2. Touch OverrideとAutomation軌道への復帰
3. 名前付きSceneと部分Scene
4. Cue Table、Spatial Preview、Inspector
5. MaxからのCue操作と状態フィードバック
6. Auto-follow、Loop、Tempo Sync、通信量最適化

この順序も確定Roadmapではありません。Cue Workspaceへ着手すると判断した時点で、現行の簡潔な操作面を維持できるか、別ページ・別entry point・別アプリのどれが適切かを改めて決定します。

## OSS公開版との境界

初期OSS公開では、この構想を実装条件にしません。公開版の説明は現在動作するPerformance Surface、DBAP、OSC Protocol、Max受信例に限定します。

- READMEの機能一覧へ未実装Cue機能を載せない
- 現行Protocolへ予約アドレスとして追加しない
- Cue Editorを理由に初期公開を遅らせない
- IssueやRoadmapへ移す場合は、実装意思と保守範囲を決めてから行う

将来この構想を正式採用する場合は、本書を仕様書としてそのまま扱わず、Decision Recordと実装可能なIssueへ分解します。
