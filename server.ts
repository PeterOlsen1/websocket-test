import { WebSocketServer } from 'ws';
import { v4 as uuid } from 'uuid';
import { INVALID_ROOM_ERR } from './src/lib/constants.ts'


interface Room {
    clients: Record<string, WebSocket>
    created: Date
}

const wss = new WebSocketServer({ port: 8080 });

const users: {[key: string]: string} = {};
const allClients: {[key: string]: WebSocket} = {};
const rooms: {[key: string]: Room} = {};
let freeClients: WebSocket[] = [];

/**
 * Generate a random room id
 */
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        id += chars[randomIndex];
    }
    return id;
}

function makeGetClients(roomId: string): () => WebSocket[] | undefined {
    return () => {
        if (!roomId) { return; }
        const c = rooms[roomId]?.clients;
        if (!c) { return; }
        return Object.values(c);
    } 
}

wss.on('connection', (ws) => {
    // save client to clients map
    const id = uuid();
    console.log('new client: ' + id);
    let username = id;
    let roomId: string = '';
    users[id] = username;
    allClients[id] = ws;
    let getClients: () => WebSocket[] | undefined;

    freeClients.push(ws);

    ws.send(JSON.stringify({
        type: 'start',
        rooms: Object.keys(rooms)
    }));


    ws.on('message', (d) => {
        let data;
        try {
            data = JSON.parse(d as any);
        }
        catch (e) {
            console.log("failed to parse JSON");
            console.log(e);
            ws.send(JSON.stringify({
                type: 'error',
                error: e
            }));
            return;
        }

        if (data.to) { // we have a specific recipient
            let toSocket: WebSocket = allClients[data.to];
            if (data.to.includes('-screenshare')) {
                toSocket = allClients[data.to.split('-screenshare')[0]]
            }
            
            if (!toSocket) { return; }

            // if (data.mediaType && data.mediaType == 'screenshare') {
            //     toSocket.send(JSON.stringify({ ...data, from: id + '-screenshare' }));
            // }
            // else {
                toSocket.send(JSON.stringify({ ...data, from: id }));
            // }
        }

        else if (data.type == 'start') { // room start
            //initialize room and function to gather all clients
            const room: Room = {
                clients: {},
                created: new Date()
            }
            roomId = generateRoomId();
            while (rooms[roomId]) { //generate unused id
                roomId = generateRoomId();
            }
            rooms[roomId] = room;
            getClients = makeGetClients(roomId);

            //notify the user that the room has started
            ws.send(JSON.stringify({
                type: 'start',
                roomId: roomId
            }));

            freeClients.forEach(c => {
                c.send(JSON.stringify({
                    type: 'start',
                    rooms: Object.keys(rooms)
                }));
            })
        }
        else if (data.type == 'end') {
            const clients = getClients?.();
            if (!clients) { return; }

            clients.forEach(c => {
                c.send(JSON.stringify({
                    type: 'end'
                }));
                c.close();
            });

            const roomId = data.roomId;
            delete rooms[roomId];
        }

        else if (data.type == 'username') { //update username
            users[id] = data.username;
            username = data.username;
        }
        else if (data.type == 'message') { //send chat
            //send to each so that the message displays on the user too
            if (!roomId) { return; }

            const clients = getClients?.();
            if (!clients) { return; }

            clients.forEach((c: WebSocket) => {
                c.send(JSON.stringify({
                    'type': 'message',
                    'message': data.message,
                    "sender": username || "unknown"
                }));
            });
        }
        else if (data.type == 'join') { // join room
            freeClients = freeClients.filter(c => c != ws);

            roomId = data.roomId;
            if (!rooms[roomId]) {
                console.log("Joined invalid room!");
                ws.send(JSON.stringify({
                    type: 'error',
                    error: 'INVALID_ROOM'
                }));
                return;
            }

            //manually fetch clients here since we need keys, not just values
            const clients = rooms[roomId]?.clients;
            if (!clients) {
                return;
            }
            clients[id] = ws;

            //create new user object and send it
            const newUser = JSON.stringify({
                type: 'join',
                position: wss.clients.size,
                id,
                users: Object.keys(clients).filter(key => key != id)
            });

            Object.values(clients).forEach(c => {
                c.send(newUser);
            });
        }
        else { // idk what makes it here
            if (!roomId) {
                return;
            }

            const clients = getClients?.();
            if (!clients) { return; }

            clients.forEach(c => {
                if (c.readyState === ws.OPEN) {
                    c.send(JSON.stringify({ ...data, from: id }));
                }
            });
        }
    });


    //cleanup on close
    ws.on('close', () => {
        freeClients = freeClients.filter(c => c != ws);
        delete users[username];
        delete allClients[id];

        const clients = getClients?.();
        if (!clients) { return; }

        //delete entire room if this is the only one left, otherwise just delete client
        if (clients.length == 1) {
            delete rooms[roomId];
        }
        else {
            delete rooms[roomId].clients[id];
        }
    });
});