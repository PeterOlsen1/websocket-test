import { WebSocketServer } from 'ws';
import { v4 as uuid } from 'uuid';

const wss = new WebSocketServer({ port: 8080 });

const users: {[key: string]: string} = {};
const clients: {[key: string]: WebSocket} = {};
let broadcaster: WebSocket | null = null;

wss.on('connection', (ws) => {
    // save client to clients map
    const id = uuid();
    console.log('new client: ' + id);
    let username = id;
    users[id] = username;
    clients[id] = ws;


    ws.on('message', (d) => {
        let data;
        try {
            data = JSON.parse(d);
        }
        catch (e) {
            console.log("failed to parse JSON");
            console.log(e);
            ws.send(JSON.stringify({
                'type': 'error',
                'error': e
            }));
            return;
        }

        if (data.to) {
            //see if we need to send to broadcaster or a specific client
            let toSocket: WebSocket;
            if (data.to == 'broadcaster') {
                toSocket = broadcaster;
            }
            else {
                toSocket = clients[data.to];
            }

            if (toSocket) {
                toSocket.send(JSON.stringify({ ...data, from: id }));
            }
        }

        else if (data.type == 'username') {
            users[id] = data.username;
            username = data.username;
        }
        else if (data.type == 'message') {
            //send to each so that the message displays on the user too
            wss.clients.forEach((c) => {
                c.send(JSON.stringify({
                    'type': 'message',
                    'message': data.message,
                    "sender": username || "unknown"
                }));
            });
        }
        else if (data.type == 'join') {
            const newUser = JSON.stringify({
                type: 'join',
                position: wss.clients.size,
                // broadcaster: wss.clients.size == 1,
                id,
                users: Object.keys(clients).filter(key => key != id)
            });

            //user joined the call, send to everyone!
            wss.clients.forEach(c => {
                if (c.readyState == ws.OPEN) {
                    c.send(newUser);
                }
            });
        }
        else {
            //send to everyone but the sender
            wss.clients.forEach((c) => {
                if (c.readyState === ws.OPEN) {
                    c.send(JSON.stringify({ ...data, from: id }));
                }
            })
        }
    });

    ws.on('close', () => {
        delete users[username];
        delete clients[id];
    });
});