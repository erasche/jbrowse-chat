# JBrowse Chat Plugin

Currently very WIP, but I finally had a few moments alone and could implement this.

## Screenshot

![](./img/screenshot.png)

## Feature List

If you think of other features you want, let me know.

Status | Feature
------ | -------
100%   | Google Login
100%   | Multiuser chat
50%    | Per-instance OR per-refseq rooms
50%    | Link to locations
0%     | Comments wherever there is a popup

## Example configuration

```ini
[plugins.Chat]
location = plugins/Chat
server = http://localhost:5000
granularity = refseq
```

## LICENSE

AGPL-3.0
