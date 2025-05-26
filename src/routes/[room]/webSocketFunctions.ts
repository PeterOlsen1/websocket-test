import { goto } from "$app/navigation";
import { INVALID_ROOM_ERR } from "$lib/constants";
import type { StreamEntry } from "./types.d.ts";
//@ts-ignore: importing from types.d.ts works just fine
import { MediaType } from "./types.d.ts";

interface UserStreams {
    camera: MediaStream | null;
    screenshare: MediaStream | null;
    audio: MediaStream | null;

    //promises are used to check if these conditions are ready
    cameraReady: Promise<MediaStream>;
    screenshareReady: Promise<MediaStream>;
    audioReady: Promise<MediaStream>;

    //resolvers are used to complete the promsie
    cameraResolve: (s: MediaStream) => void;
    screenshareResolve: (s: MediaStream) => void;
    audioResolve: (s: MediaStream) => void;
}

let id: string = '';
export let streamResolve: (s: MediaStream) => void;
const streamReady = new Promise<MediaStream>((resolve) => { streamResolve = resolve; });

export let screenShareResolve: (s: MediaStream) => void;
const screenShareReady = new Promise<MediaStream>((resolve) => { screenShareResolve = resolve; });

let resolveFunctions = {
    camera: (wsc: WebSocketClient, s: MediaStream) => {
        wsc.userStreams.camera = s;
        wsc.addMediaStream(s, MediaType.VIDEO);
    },
    screenshare: (wsc: WebSocketClient, s: MediaStream) => {
        wsc.userStreams.screenshare = s;
        wsc.addMediaStream(s, MediaType.SCREENSHARE);
    }
}

export default class WebSocketClient {
    ws: WebSocket;
    streams: StreamEntry[];
    docRef: HTMLDivElement;
    isOwner: { status: boolean }
    stream: MediaStream | null = null;
    peers: {[key: string]: RTCPeerConnection};
    currentScreenshare: boolean = false;
    userStreams: UserStreams;

    constructor(sock: WebSocket, 
        peers: {[key: string]: RTCPeerConnection}, streams: StreamEntry[],  
        docRef: HTMLDivElement | null, isOwner: {status: boolean}) {
        this.ws = sock;
        this.peers = peers;
        this.streams = streams;
        this.docRef = docRef ?? document.createElement('div'); //won't happen
        this.isOwner = isOwner;

        //initialize 3 arbitrary promises
        const proms = [];
        const resolves: ((s: MediaStream) => void)[] = new Array<(s: MediaStream) => void>();
        for (let i = 0; i < 3; i++) {
            let promise = new Promise<MediaStream>((resolve) => { 
                resolves.push(resolve);
            });
            proms.push(promise);
        }

        //initialize userStreams object to keep track of current user streams
        this.userStreams = {
            camera: null,
            screenshare: null,
            audio: null,

            cameraReady: proms[0],
            cameraResolve: resolves[0],

            screenshareReady: proms[1],
            screenshareResolve: resolves[1],

            audioReady: proms[2],
            audioResolve: resolves[2]
        }
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

            //create connections with all of the current active users
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

            //give the new user all of our data
            let startNewUser = (mediaStream: MediaStream | null, awaiter: Promise<MediaStream>, mediaType: MediaType) => {
                console.log('running start new user');
                if (mediaStream) {
                    console.log('actually running media type: ' + mediaType);
                    this.newUser(data.id, mediaStream, awaiter, mediaType);
                }
            }

            startNewUser(this.userStreams.camera, this.userStreams.cameraReady, MediaType.VIDEO);
            startNewUser(this.userStreams.screenshare, this.userStreams.screenshareReady, MediaType.SCREENSHARE);
            // startNewUser(this.userStreams.audio, this.userStreams.audioReady, MediaType.AUDIO);
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

            if (data.from == id) {
                console.error("Sending media to self!");
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


                if (mediaType == MediaType.VIDEO && this.userStreams.camera) {
                    console.log('adding stream content back to offered stream');
                    this.userStreams.camera?.getTracks().forEach((t) => {
                        pc.addTrack(t, this.userStreams.camera as MediaStream);
                    })
                }
                else if (mediaType == MediaType.SCREENSHARE && this.userStreams.screenshare) {
                    this.userStreams.screenshare?.getTracks().forEach(t => {
                        console.error('Adding screenshare track to connection after offer (unlikely, look into this if it happens)');
                        pc.addTrack(t, this.userStreams.screenshare as MediaStream);
                    });
                }
                // else if (mediaType == MediaType.AUDIO && this.userStreams.audio) {
                //     this.userStreams.audio?.getTracks().forEach(t => {
                //         pc.addTrack(t, this.userStreams.audio as MediaStream);
                //     })
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
                console.log(data.from);
                return;
            }

            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    }

    /**
     * Startup function for a new user join,
     * set up a remote connection and send offer
     * 
     * @param userId
     */
    async newUser(userId: string, stream: MediaStream | null, streamAwaiter: Promise<MediaStream>, mediaType: MediaType) {    
        const pc = await this.start(userId, MediaType.VIDEO);
        this.peers[userId] = pc;

        if (!stream) {
            await streamAwaiter;
        }

        if (!stream) {
            return;
        }

        stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.ws.send(JSON.stringify({ type: "offer", offer, to: userId, mediaType }));
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
                this.streams = this.streams.filter((s) => s.id != to);
                videoDiv?.remove();
            }
        }

        return pc;
    }

    /**
     * Add a new media stream to the existing media streams
     */
    async addMediaStream(s: MediaStream, type: MediaType) {
        const clients = Object.keys(this.peers);
        const tracks = s.getTracks();

        // Update local userStreams references
        if (type == MediaType.VIDEO) {
            this.userStreams.camera = s;
            this.userStreams.cameraResolve(s);
        } else if (type == MediaType.SCREENSHARE) {
            this.userStreams.screenshare = s;
            this.userStreams.screenshareResolve(s);
        }

        // For each peer, add tracks and renegotiate
        for (const id of clients) {
            const pc = this.peers[id];

            // Only add tracks that aren't already present
            tracks.forEach(track => {
                // Check if this track is already being sent
                const senders = pc.getSenders();
                const alreadyAdded = senders.some(sender => sender.track && sender.track.id === track.id);
                if (!alreadyAdded) {
                    pc.addTrack(track, s);
                }
            });

            // Renegotiate: create and send a new offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.ws.send(JSON.stringify({
                type: "offer",
                offer,
                to: id,
                mediaType: type
            }));
        }
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