<script lang="ts">
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
</div>