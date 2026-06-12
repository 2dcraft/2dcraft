# 2Dcraft Server Host

Run this on your PC to host a game server your friends can join from the website.

## Requirements
- Node.js 18+ (https://nodejs.org)

## Setup (one time)
```
npm install
```

## Run
```
node server.js
```

It will ask you a few questions (server name, your username, mode, max players) then start up and print your IP address. Share that IP with friends — they paste it into the "Join by IP" box on the website.

## Options (skip the questions)
```
node server.js --name "My Server" --user "YourName" --port 25565 --public
```

- `--public` — makes your server visible in the public server list on the website
- `--port` — change the port (default 25565)

## For friends to connect over the internet
You need to forward **port 25565 TCP** on your router to your PC. Then share your **public IP** (shown when the server starts). For same-network / LAN play no port forwarding is needed.
