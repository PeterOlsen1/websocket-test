<!-- <script lang="ts">
    import { onMount } from "svelte";

    let responses = $state([""]);
    let message = $state('');
    let username = $state('');
    let videoDiv: HTMLVideoElement | null = $state(null);
    let remoteVideo: HTMLVideoElement | null = null;
    let peer: RTCPeerConnection;
    let isBroadcaster: boolean = $state(false);
    let id: string;

    let peers: { [key: string]: RTCPeerConnection } = {};
    let stream: MediaStream;

    let iceQueue: RTCIceCandidate[] = [];
    let remoteDescriptionSet = false;

    const ws = new WebSocket('ws://localhost:8080');
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join'
        }));
    }
    ws.onmessage = async (event: any) => {
        const data = JSON.parse(event.data);
        if (data.type == 'message') {
            responses.push(`${data.sender}: ${data.message}`);
        }
        
        if (data.type == 'error') {
            console.error(data.error);
        }

        if (data.type === "offer" && !isBroadcaster) {
            if (peer?.signalingState !== "stable") {
                console.warn("Skipping duplicate offer");
                return;
            }

            await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
            remoteDescriptionSet = true;

            // Flush any queued ICE candidates
            for (const candidate of iceQueue) {
                await peer.addIceCandidate(candidate);
            }
            iceQueue = [];

            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: "answer", answer }));
        }

        if (data.type === "answer" && isBroadcaster) {
            console.log(data);
            await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
            remoteDescriptionSet = true;

            // Flush queued ICE
            for (const candidate of iceQueue) {
                await peer.addIceCandidate(candidate);
            }
            iceQueue = [];
        }

        if (data.type === "ice") {
            if (data.from == id) {
                //don't send ice candidates to yourself
                return;
            }

            //ice candidate sent to server, throw it in the queue
            const candidate = new RTCIceCandidate(data.ice);
            if (remoteDescriptionSet) {
                await peer.addIceCandidate(candidate);
            } else {
                iceQueue.push(candidate);
            }
        }

        //we are the broadcaster and a new user joined
        else if (data.type == 'join' && id && data.id != id && isBroadcaster) {
            console.log(data);
            // create new peer connection for the new user
            const pc = createPeer();
            peers[data.id] = pc;

            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            // create offer for the new user
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: "offer", offer, to: data.id }));
        }

        //first join of any user
        else if (data.type == 'join' && !id) {
            isBroadcaster = data.broadcaster;
            id = data.id;
            console.log('First join, starting peer connection process');
            start();
        }
    }

    async function start() {
        peer = createPeer();

        if (isBroadcaster && videoDiv) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoDiv.srcObject = stream;

            // stream.getTracks().forEach(track => {
            //     peer.addTrack(track, stream);
            // });

            // const offer = await peer.createOffer();
            // await peer.setLocalDescription(offer);

            // ws.send(JSON.stringify({ type: "offer", offer }));
        }
    }

    //create peer connection to recieve tracks
    function createPeer() {
        const config = {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        };
        const pc = new RTCPeerConnection(config);
    
        //send ice candidate to other users
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                ws.send(JSON.stringify({ type: "ice", ice: e.candidate }));
            }
        };

        pc.ontrack = (e) => {
            console.log(e);
            remoteVideo.srcObject = e.streams[0];
        };

        return pc;
    }

    //send a message to the socket server
    function sendMessage() {
        ws.send(JSON.stringify({
            "type": "message",
            "message": message
        }));
        message = "";
    }

    //update username to the socket server
    function sendUsername() {
        ws.send(JSON.stringify({
            "type": "username",
            "username": username
        }));
    }
</script>

<div>
    <div>
        Change your username:
        <input type="text" bind:value={username} 
            onkeypress={(e: KeyboardEvent) => 
                e.key == 'Enter' && username && sendUsername()
            }
        >
        <button onclick={() => 
            username && sendUsername()
        }>
            change user
        </button>
    </div>
    <br>
    <div>
        Send a message:
        <input type="text" bind:value={message} onkeypress={(e: KeyboardEvent) => 
            e.key == 'Enter' && message && sendMessage()
        }>
        <button onclick={() => {
            message && sendMessage()
        }}>
            send your message
        </button>
    </div>

    <br><br>
    response:
    <br>
    {#each responses as resp}
        {resp}
        <br>
    {/each}

    <br>
    {#if isBroadcaster}
        you are the broadcaster!
        <br>
    {/if}
    <video bind:this={videoDiv} style="transform: scaleX(-1)" autoplay></video>
    <video
        bind:this={remoteVideo}
        autoplay
        style="transform: scaleX(-1);"
    ></video>
    <br>
</div> -->

<script>
    import { goto } from "$app/navigation";
    import { WEBSOCKET_URL } from "$lib/constants";
    const ws = new WebSocket(WEBSOCKET_URL);

    ws.onmessage = (event) => {
        let data;
        try {
            data = JSON.parse(event.data);
        }
        catch (e) {
            console.error("Could not parse JSON!");
            return;
        }

        if (data.type == 'start') {
            const roomId = data.roomId;
            ws.close();
            goto(`/${roomId}`);
        }
    }

    function startRoom() {
        ws.send(JSON.stringify({
            type: 'start'
        }));
    }
</script>

<style>
    .main {
        width: 100%;
        overflow-x: hidden;
        display: flex;
        text-align: center;
        flex-direction: column;
    }

    .header {
        width: 100%;
        padding-top: 1em;
        font-size: 4em;
        text-align: start;
        /* padding-left: 1em; */
        font-weight: 600;
        background-color: white;
        color: black;

        .header-text {
            padding-left: 2em;
        }

        .header-subtext {
            font-size: 0.25em;
            padding-left: 16em;
            color: rgb(48, 48, 48);
        }
    }

    .svg-wrapper {
        z-index: 1;
    }

    .text-container {
        width: 90%;
        text-align: left;
        margin-left: auto;
        margin-right: auto;
        z-index: 3;
    }

    .body {
        width: 100%;
        min-height: 35vh;

        .title {
            width: 100%;
            text-align: center;
            font-size: 1.5em;
            font-weight: 600;
            margin-bottom: 1em;
        }
    }
    .white {
        background-color: white;
        color: black;
        min-height: 70vh;
    }
</style>

<div class="main">
    <div class="header">
        <div class="header-text">
            Peter's Zoom.
        </div>
        <div class="header-subtext">
            An all new way to video conference
        </div>
        <!-- <div class="underline"></div> -->
        <div class="svg-wrapper" style="transform: scaleY(-1) scaleX(-1); position: relative; top: 0.3em;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320">
                <path fill="rgb(47, 47, 47)" fill-opacity="1" d="M0,160L34.3,149.3C68.6,139,137,117,206,122.7C274.3,128,343,160,411,181.3C480,203,549,213,617,186.7C685.7,160,754,96,823,74.7C891.4,53,960,75,1029,101.3C1097.1,128,1166,160,1234,176C1302.9,192,1371,192,1406,192L1440,192L1440,0L1405.7,0C1371.4,0,1303,0,1234,0C1165.7,0,1097,0,1029,0C960,0,891,0,823,0C754.3,0,686,0,617,0C548.6,0,480,0,411,0C342.9,0,274,0,206,0C137.1,0,69,0,34,0L0,0Z"></path>
            </svg>
        </div>
    </div>
    <div class="body">
        <div class="text-container">
            <br><br>
            This was created as a project to test my networking skills. Initially, I had planned to just create a websocket
            based chatting application, which I was able to spin up in around an hour or so. Upon completion of that,
            I decided I wanted to take it one step further, and challenge myself with some new networking concepts.

            <br><br>
            This guided me to trying out WebRTC for the first time, which proved to be a tough challenge. Having never
            done advanced networking that required signaling to establish a connection, learning how to start
            the WebRTC communication process was a challenge. I ended up creating a siganling server with websockets
            to allow clients to communicate with one another.

            <br><br>
            That's enough of me talking, check it out below!
        </div>
    </div>
    <div class="body white">
        <div class="svg-wrapper" style="position: relative; top: -1em;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320">
                <path fill="rgb(47, 47, 47)" fill-opacity="1" d="M0,160L34.3,149.3C68.6,139,137,117,206,117.3C274.3,117,343,139,411,149.3C480,160,549,160,617,149.3C685.7,139,754,117,823,112C891.4,107,960,117,1029,112C1097.1,107,1166,85,1234,85.3C1302.9,85,1371,107,1406,117.3L1440,128L1440,0L1405.7,0C1371.4,0,1303,0,1234,0C1165.7,0,1097,0,1029,0C960,0,891,0,823,0C754.3,0,686,0,617,0C548.6,0,480,0,411,0C342.9,0,274,0,206,0C137.1,0,69,0,34,0L0,0Z"></path>
            </svg>
        </div>
        <div class="text-container" style="position: relative; top: -3.5em;">
            <div class="title">
                Start your own room, or join any that are open!
            </div>
            <div>
                Start room
                <button onclick={startRoom}>
                    Start
                </button>
            </div>
            <div>
                Join room
                <input type="text">
            </div>
        </div>
    </div>
</div>