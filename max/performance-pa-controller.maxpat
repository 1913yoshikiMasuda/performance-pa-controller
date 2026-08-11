{
  "patcher": {
    "fileversion": 1,
    "appversion": { "major": 8, "minor": 6, "revision": 0, "architecture": "x64", "modernui": 1 },
    "classnamespace": "box",
    "rect": [80.0, 80.0, 760.0, 430.0],
    "boxes": [
      { "box": { "id": "title", "maxclass": "comment", "text": "Performance PA Controller — OSC receiver", "patching_rect": [36.0, 28.0, 320.0, 20.0] } },
      { "box": { "id": "udp", "maxclass": "newobj", "text": "udpreceive 7400", "patching_rect": [36.0, 78.0, 112.0, 22.0] } },
      { "box": { "id": "parse", "maxclass": "newobj", "text": "oscparse", "patching_rect": [36.0, 126.0, 65.0, 22.0] } },
      { "box": { "id": "trim", "maxclass": "newobj", "text": "list trim", "patching_rect": [36.0, 174.0, 58.0, 22.0] } },
      { "box": { "id": "print", "maxclass": "newobj", "text": "print pps", "patching_rect": [36.0, 222.0, 60.0, 22.0] } },
      { "box": { "id": "route-pps", "maxclass": "newobj", "text": "route pps", "patching_rect": [190.0, 222.0, 64.0, 22.0] } },
      { "box": { "id": "route-system", "maxclass": "newobj", "text": "route system", "patching_rect": [278.0, 222.0, 82.0, 22.0] } },
      { "box": { "id": "prepend-pps", "maxclass": "newobj", "text": "prepend pps", "patching_rect": [278.0, 278.0, 82.0, 22.0] } },
      { "box": { "id": "route-ping", "maxclass": "newobj", "text": "route ping", "patching_rect": [384.0, 222.0, 68.0, 22.0] } },
      { "box": { "id": "unpack-ping", "maxclass": "newobj", "text": "unpack i i", "patching_rect": [476.0, 222.0, 72.0, 22.0] } },
      { "box": { "id": "pong-format", "maxclass": "newobj", "text": "oscformat pps system pong", "patching_rect": [476.0, 278.0, 164.0, 22.0] } },
      { "box": { "id": "pong-port", "maxclass": "message", "text": "port $1", "patching_rect": [650.0, 250.0, 56.0, 22.0] } },
      { "box": { "id": "pong-send", "maxclass": "newobj", "text": "udpsend 127.0.0.1 7401", "patching_rect": [548.0, 326.0, 158.0, 22.0] } },
      { "box": { "id": "note", "maxclass": "comment", "linecount": 8, "text": "Open the Max Console, then trigger the web UI.\nThe system/ping route automatically returns system/pong.\nThis enables continuous OSC round-trip health monitoring.\nUse route pps -> route spatial pad fader in your patch.\nSpatial touch sends trigger 1; release sends trigger 0.\nPosition and gains update while the spatial gate is held.\nPads also send 1 on press and 0 on release.\nSound generation, smoothing, DSP, and Audio I/O remain in Max.", "patching_rect": [190.0, 78.0, 470.0, 128.0] } }
    ],
    "lines": [
      { "patchline": { "source": ["udp", 0], "destination": ["parse", 0] } },
      { "patchline": { "source": ["parse", 0], "destination": ["trim", 0] } },
      { "patchline": { "source": ["trim", 0], "destination": ["route-pps", 0] } },
      { "patchline": { "source": ["route-pps", 0], "destination": ["route-system", 0] } },
      { "patchline": { "source": ["route-system", 1], "destination": ["prepend-pps", 0] } },
      { "patchline": { "source": ["prepend-pps", 0], "destination": ["print", 0] } },
      { "patchline": { "source": ["route-system", 0], "destination": ["route-ping", 0] } },
      { "patchline": { "source": ["route-ping", 0], "destination": ["unpack-ping", 0] } },
      { "patchline": { "source": ["unpack-ping", 0], "destination": ["pong-format", 0] } },
      { "patchline": { "source": ["unpack-ping", 1], "destination": ["pong-port", 0] } },
      { "patchline": { "source": ["pong-port", 0], "destination": ["pong-send", 0] } },
      { "patchline": { "source": ["pong-format", 0], "destination": ["pong-send", 0] } }
    ]
  }
}
