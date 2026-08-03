{
  "patcher": {
    "fileversion": 1,
    "appversion": { "major": 8, "minor": 6, "revision": 0, "architecture": "x64", "modernui": 1 },
    "classnamespace": "box",
    "rect": [80.0, 80.0, 640.0, 360.0],
    "boxes": [
      { "box": { "id": "title", "maxclass": "comment", "text": "Performance PA Controller — OSC receiver", "patching_rect": [36.0, 28.0, 320.0, 20.0] } },
      { "box": { "id": "udp", "maxclass": "newobj", "text": "udpreceive 7400", "patching_rect": [36.0, 78.0, 112.0, 22.0] } },
      { "box": { "id": "parse", "maxclass": "newobj", "text": "oscparse", "patching_rect": [36.0, 126.0, 65.0, 22.0] } },
      { "box": { "id": "trim", "maxclass": "newobj", "text": "list trim", "patching_rect": [36.0, 174.0, 58.0, 22.0] } },
      { "box": { "id": "print", "maxclass": "newobj", "text": "print pps", "patching_rect": [36.0, 222.0, 60.0, 22.0] } },
      { "box": { "id": "note", "maxclass": "comment", "linecount": 6, "text": "Open the Max Console, then trigger the web UI.\nUse route pps -> route spatial pad fader in your patch.\nTouch sends trigger 1; release sends trigger 0.\nPosition and gains update while the gate is held.\nSound generation, smoothing, DSP, and Audio I/O remain in Max.", "patching_rect": [190.0, 78.0, 390.0, 96.0] } }
    ],
    "lines": [
      { "patchline": { "source": ["udp", 0], "destination": ["parse", 0] } },
      { "patchline": { "source": ["parse", 0], "destination": ["trim", 0] } },
      { "patchline": { "source": ["trim", 0], "destination": ["print", 0] } }
    ]
  }
}
