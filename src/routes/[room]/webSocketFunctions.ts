import { goto } from "$app/navigation";
import { INVALID_ROOM_ERR } from "$lib/constants";
import type StreamEntry from "./types";

enum MediaType {
    SCREENSHARE = "screenshare",
    VIDEO = "video",
    AUDIO = "audio"
}

let id: string = '';
export let streamResolve: (s: MediaStream) => void;
const streamReady = new Promise<MediaStream>((resolve) => { streamResolve = resolve; });

export let screenShareResolve: (s: MediaStream) => void;
const screenShareReady = new Promise<MediaStream>((resolve) => { screenShareResolve = resolve; });

export default class WebSocketClient {
    ws: WebSocket;
    streams: StreamEntry[];
    docRef: HTMLDivElement;
    isOwner: { status: boolean }
    stream: MediaStream | null = null;
    peers: {[key: string]: RTCPeerConnection};

    constructor(sock: WebSocket, 
        peers: {[key: string]: RTCPeerConnection}, streams: StreamEntry[],  
        docRef: HTMLDivElement | null, isOwner: {status: boolean}) {
        this.ws = sock;
        this.peers = peers;
        this.streams = streams;
        this.docRef = docRef ?? document.createElement('div'); //won't happen
        this.isOwner = isOwner;
    }

    /**
     * Assign this to the websocket onOpen function
     */
    onOpen(roomId: string) {
        this.ws.send(JSON.stringify({
            type: 'join',
            roomId
        }));
    }

    /**
     * Assign this to the websocket onMessage function
     */
    async onMessage(event: any): Promise<void> {
        let data;
        try {
            data = JSON.parse(event.data);
        }
        catch (e) {
            console.error('failed to parse JSON');
            console.error(e);
            return;
        }

        if (data.type == 'error') {
            console.error("Encountered error! \n" + data.error);

            if (data.error == INVALID_ROOM_ERR) {
                alert("Room is not valid!");
                goto('/');
            }
            return;
        }
        else if (data.type == 'end') {
            goto('/end');
        }
        
        else if (data.type == 'join' && !id) { //current user does not have ID yet
            id = data.id;
            console.log("First join! Our ID is: " + id);
            if (data.position == 1) {
                this.isOwner.status = true;
            }

            // //create connections with all of the current active users
            // data.users?.forEach((u: string) => {
            //     this.newUser(u);
            // });
        }
        else if (data.type == 'join') { // new user joined
            if (!data.id) {
                console.error("User joined with no ID!");
                return;
            }
            console.log("New user joined: " + data.id);

            if (!this.stream) {
                console.error("Media stream has not been started yet!");
                return;
            }

            //call function to start new user operations
            this.newUser(data.id);
        }
        else if (data.type == 'ice') {
            if (data.from == id || !data.from) {
                return;
            }

            const cand = new RTCIceCandidate(data.ice);
            const pc = this.peers[data.from];
            if (!pc) {
                return;
            }

            await pc.addIceCandidate(cand);
        }
        else if (data.type == 'offer') {
            if (!data.from) {
                console.error("Offer does not contain from attribute!");
                return;
            }

            let mediaType = MediaType.VIDEO;
            let from = data.from;
            //the sender wants to screenshare. make a new connection for that
            if (data.mediaType && data.mediaType == 'screenshare') {
                from += '-screenshare'
                mediaType = MediaType.SCREENSHARE;
            }

            let pc = this.peers[from];
            if (!pc) { //this client did not initiate a connection, it needs to create a peer connection
                pc = await this.start(from, mediaType);

                //add tracks only if this is not a screenshare
                // if (mediaType == MediaType.VIDEO) {
                    this.stream?.getTracks().forEach((t) => {
                        pc.addTrack(t, this.stream as MediaStream);
                    });
                // }
                this.peers[from] = pc;
            }

            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.ws.send(JSON.stringify({ type: 'answer', answer, to: from }));
        }
        else if (data.type == 'answer') {
            if (!data.from) {
                console.error("Answer does not contain from attribute!");
                return;
            }

            const pc = this.peers[data.from];
            if (!pc) {
                console.error("Peer connection not found! (answer)");
                return;
            }

            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    }

    /**
     * Startup function for a new user join,
     * set up a remote connection and send office
     * 
     * @param userId
     */
    async newUser(userId: string) {    
        const pc = await this.start(userId, MediaType.VIDEO);
        this.peers[userId] = pc;

        //wait for stream if it is not defined by this point
        if (!this.stream) { 
            await streamReady; 
        }

        //stream will not be null, we already checked earlier
        //@ts-ignore
        this.stream.getTracks().forEach((track) => {
            pc.addTrack(track, this.stream as MediaStream);
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.ws.send(JSON.stringify({ type: "offer", offer, to: userId }));
    }

    /**
     * Start function, return a new peer connection
     */
    async start(to: string | null = null, mediaType: MediaType) {
        const config = {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        };
        const pc = new RTCPeerConnection(config);

        pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
            if (ev.candidate) {
                const obj = {
                    type: "ice",
                    ice: ev.candidate,
                    mediaType
                }
                if (to) {
                    //@ts-ignore
                    obj.to = to;
                }

                this.ws.send(JSON.stringify(obj));
            }
        }

        pc.ontrack = (ev: RTCTrackEvent) => {
            //only push the stream if the ID is unique
            let uniqueId = true;
            let sId = ev.streams[0].id;
            this.streams.forEach(s => {
                if (s.stream.id == sId) {
                    uniqueId = false;
                }
            });

            if (uniqueId) {
                this.streams.push({
                    id: to || id,
                    stream: ev.streams[0]
                });
            }
        }

        pc.onconnectionstatechange = () => {
            if (pc.connectionState == 'connecting') {
                const loadingDiv = document.createElement('div');
                loadingDiv.className = 'loader';
                loadingDiv.id = `loading-${to}`;
                this.docRef?.appendChild(loadingDiv);
            }
            else if (pc.connectionState == 'connected') {
                const loader = this.docRef?.querySelector(`#loading-${to}`);
                loader?.remove();
            }
            else if ((pc.connectionState === "disconnected" || pc.connectionState === "failed") && to) {
                delete this.peers[to];
                //dont worry about checking the main id here, entire page will be gone if they leave
                const videoDiv = document.querySelector(`#user-${to}`);
                videoDiv?.remove();
                this.streams = this.streams.filter((s) => s.id != to);
            }
        }

        return pc;
    }

    /**
     * Add a new media stream to the existing media streams
     */
    addMediaStream(s: MediaStream) {
        const clients = Object.keys(this.peers);
        const tracks = s.getTracks();

        //loop over all clients and add tracks
        clients.forEach(async id => {
            const c = this.peers[id];
            tracks.forEach(t => {
                c.addTrack(t, s);
            });

            const offer = await c.createOffer();
            await c.setLocalDescription(offer);
            this.ws.send(JSON.stringify({ type: "offer", offer, 
                to: id, mediaType: 'screenshare'}));
        });
    }

    /**
     * Send message to web socket to end the room
     */
    endCall() {
        this.ws.send(JSON.stringify({
            type: 'end',
            user: id
        }));
    }
}