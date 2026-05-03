'use strict';

const AiPrompts = (() => {
    const PROMPT = `You are helping me document my home network using LanDocs — a free browser-based network documentation tool.

Generate a complete network layout as a JSON file that I can import directly into the app.

The JSON must follow this EXACT format (do not add extra fields):
Output only the JSON object. No markdown fences, no commentary, no explanations before or after.
The JSON must be valid (parseable by JSON.parse).
Every id field must be a unique RFC 4122 UUID v4 (e.g., "6fa4a6df-fd1b-48f1-b7b4-9587a0e55348").
Never reuse a UUID across different fields.

Top-level structure:
{
  "devices": [ ... ],
  "connections": [ ... ],
  "groups": [ ... ],
  "viewport": { "panX": 100, "panY": 200, "zoom": 0.4 },
  "customDeviceTypes": []
}
All five keys are required. customDeviceTypes is almost always [].

Device schema
Every device object has this shape:
{
  "id": "<uuid>",
  "type": "server" | "router" | "switch" | "pc" | "custom",
  "label": "Human readable name",
  "x": 1000,
  "y": 400,
  "ip": "192.168.1.1",
  "notes": "Multi-line\\nnotes about the device",
  "tags": ["tag1", "tag2"],
  "ports": [ ... ]
}
Required on every device: id, type, label, x, y, ip, notes, tags, ports.
- ip and notes may be empty strings "".
- tags may be [].
- x and y are canvas coordinates in pixels (positive right/down, negative left/up).

Type-specific extras
When type is "custom", the device must also include:
  "customColor": "#8affad",
  "customStroke": "#4b8c5f"
customColor is the fill, customStroke is the border.

Suggested palettes by category:
| Category                       | customColor | customStroke |
| ------------------------------ | ----------- | ------------ |
| Camera                         | #f6ffb3     | #878c62      |
| TV                             | #8affad     | #4b8c5f      |
| Modem / ISP gear               | #8a4ab5     | #4b2863      |
| Solar / energy                 | #ffeb14     | #8c810b      |
| EV charger                     | #b0fb65     | #608a37      |
| Heating / pink                 | #ff7aa2     | #8c4359      |
| Access point / network blue    | #6ec1e4     | #2d5a73      |
| Generic infra (injectors etc.) | #cccccc     | #666666      |

server, router, switch, pc types do NOT need customColor/customStroke (the app draws them with built-in icons).

Port schema
Every port belongs to exactly one device:
{
  "id": "<uuid>",
  "label": "Port 1",
  "connectedTo": "<uuid of the other port>" | null,
  "deviceId": "<uuid of the parent device>"
}
- label is free text. Common conventions: "Port 1", "Port 2", ..., "WAN", "LAN1", "LAN2", "Uplink1", "PoE Port 1", "SFP1", "Fiber In". Use whatever matches the real hardware.
- deviceId MUST equal the parent device's id.
- connectedTo is either null (unused port) or the id of exactly one other port on a different device.

CRITICAL RULE — BIDIRECTIONAL LINKING
Ports are linked in both directions. If port A's connectedTo points to port B's id, then port B's connectedTo MUST point back to port A's id. There are no one-way connections. Every link is mirrored.
If you violate this, the file is broken. Always set both ends.

Connections array
For every linked port pair, you must also add an entry in the top-level connections array:
{
  "id": "<uuid>",
  "portA": "<port id>",
  "portB": "<port id>",
  "label": "",
  "speed": "",
  "color": "#444444",
  "status": "up"
}
Rules:
- One connection entry per physical link (not two — the entry itself is undirected).
- portA and portB reference real port ids that exist on devices in the file.
- label and speed may be empty strings.
- color defaults to "#444444".
- status is usually "up" (other values: "down", "warning").

So every link is represented three times: once on port A (connectedTo → B), once on port B (connectedTo → A), and once in the connections array.

Groups schema
Groups are colored rectangles for visual grouping (e.g., floors, rooms, racks):
{
  "id": "<uuid>",
  "label": "Ground Floor",
  "x": 450,
  "y": 190,
  "width": 1410,
  "height": 440,
  "color": "#fce4ec"
}
Suggested pastel group colors:
- #e3f2fd (light blue)
- #fce4ec (light pink)
- #e8f5e9 (light green)
- #fff3e0 (light orange)
- #f3e5f5 (light purple)

Group x/y/width/height should encompass the devices that visually belong inside. Devices are NOT explicitly listed in the group — membership is purely spatial.

Viewport
{ "panX": 100, "panY": 200, "zoom": 0.4 }
Use zoom between 0.3 and 0.6 for typical home/SMB networks. panX/panY shift the initial view.

Layout guidance
- Choose x/y so that connected devices sit reasonably close and the topology reads top-down or left-to-right.
- Group devices by floor/room using the groups array; place all devices belonging to a floor inside that group's rectangle.
- Typical spacing: 100–200 px between sibling devices, 200–300 px between layers (gateway → switch → endpoint).
- A switch with many endpoints should sit centrally; endpoints fan out.

Validation checklist (run mentally before outputting):
1. Every id is a unique UUID.
2. Every device has all required fields.
3. Every custom device has customColor and customStroke.
4. Every port's deviceId matches the parent device's id.
5. For every non-null connectedTo, the other port also has its connectedTo pointing back.
6. The connections array contains exactly one entry per linked port pair.
7. Every portA/portB in connections refers to a real port id present in the file.
8. Group rectangles encompass the devices that belong to them.
9. The output is a single JSON object with all five top-level keys.

Minimal complete example
A two-device network: an ISP modem with one PC plugged into LAN1.
{
  "devices": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "type": "router",
      "label": "ISP Modem",
      "x": 400,
      "y": 300,
      "ip": "192.168.1.1",
      "notes": "Main internet gateway",
      "tags": ["WiFi"],
      "ports": [
        {
          "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          "label": "WAN",
          "connectedTo": null,
          "deviceId": "11111111-1111-4111-8111-111111111111"
        },
        {
          "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          "label": "LAN1",
          "connectedTo": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
          "deviceId": "11111111-1111-4111-8111-111111111111"
        }
      ]
    },
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "type": "pc",
      "label": "Desktop PC",
      "x": 700,
      "y": 300,
      "ip": "",
      "notes": "",
      "tags": [],
      "ports": [
        {
          "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
          "label": "Port 1",
          "connectedTo": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          "deviceId": "22222222-2222-4222-8222-222222222222"
        }
      ]
    }
  ],
  "connections": [
    {
      "id": "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      "portA": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      "portB": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      "label": "",
      "speed": "",
      "color": "#444444",
      "status": "up"
    }
  ],
  "groups": [
    {
      "id": "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
      "label": "Office",
      "x": 350,
      "y": 250,
      "width": 450,
      "height": 150,
      "color": "#fce4ec"
    }
  ],
  "viewport": { "panX": 100, "panY": 100, "zoom": 0.5 },
  "customDeviceTypes": []
}`;

    function show() {
        const modal = document.getElementById('modal-ai-prompts');
        document.getElementById('ai-prompt-text').value = PROMPT;
        document.getElementById('ai-copy-feedback').textContent = '';
        modal.classList.remove('hidden');
    }

    function hide() {
        document.getElementById('modal-ai-prompts').classList.add('hidden');
    }

    function setup() {
        document.getElementById('btn-ai-prompts').addEventListener('click', show);
        document.getElementById('ai-modal-close').addEventListener('click', hide);

        document.getElementById('ai-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(PROMPT).then(() => {
                const fb = document.getElementById('ai-copy-feedback');
                fb.textContent = 'Copied!';
                setTimeout(() => { fb.textContent = ''; }, 2000);
            });
        });

        document.getElementById('modal-ai-prompts').addEventListener('pointerdown', e => {
            if (e.target === document.getElementById('modal-ai-prompts')) hide();
        });
    }

    return { setup };
})();